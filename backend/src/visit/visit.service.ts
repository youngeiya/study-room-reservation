import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import type { Repository } from '../storage/repository';
import { STUDENT_REPOSITORY, Student } from '../student/student.entity';
import {
  STUDY_ROOM_REPOSITORY,
  StudyRoom,
} from '../study-room/study-room.entity';
import { CancelVisitDto } from './dto/cancel-visit.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import {
  VISIT_HISTORY_REPOSITORY,
  VISIT_REPOSITORY,
  VisitAction,
  VisitHistory,
  VisitHistoryView,
  VisitReservation,
  VisitView,
} from './visit.entity';

/**
 * 방문 신청의 업무 규칙. 이 과제의 핵심 서비스.
 *
 * 모든 쓰기는 "한 트랜잭션"에서 아래 세 가지를 함께 처리한다.
 *   1) 신청(VisitReservation) 상태 변경
 *   2) 이력(VisitHistory) 추가
 *   3) 자습실의 현재 인원(currentCount) 갱신 ← 신청 ACTIVE 가 될 때 +1, CANCELLED 가 될 때 -1
 * 셋 중 하나라도 실패하면 전부 반영되지 않는다.
 *
 * 동시성: 자습실 행(StudyRoom)이 문지기다. 정원·중복 검사는 자습실을 읽은 시점의 version 을 기준으로 하고,
 * 커밋 때 그 version 이 그대로일 때만 반영된다. 그 사이 다른 신청·취소가 자습실을 바꿨다면 충돌로 감지되어
 * 이 트랜잭션이 처음부터 다시 실행되고, 이번에는 바뀐 인원을 보고 판단한다.
 */
@Injectable()
export class VisitService {
  constructor(
    @Inject(VISIT_REPOSITORY)
    private readonly visits: Repository<VisitReservation>,
    @Inject(VISIT_HISTORY_REPOSITORY)
    private readonly histories: Repository<VisitHistory>,
    @Inject(STUDY_ROOM_REPOSITORY)
    private readonly rooms: Repository<StudyRoom>,
    @Inject(STUDENT_REPOSITORY)
    private readonly students: Repository<Student>,
    private readonly db: JsonDatabase,
    private readonly clock: Clock,
  ) {}

  /** FR-VST-01 / FN-VST-01: 방문 신청 (운영 기간·정원·중복 검사) */
  create(roomId: number, dto: CreateVisitDto): Promise<VisitReservation> {
    const visitAt = this.toIso(dto.visitAt);
    // 재시도 때 처음부터 다시 실행되므로, 필요한 값은 모두 이 안에서 새로 읽는다.
    return this.db.transaction(async () => {
      const room = await this.getActiveRoomOrThrow(roomId); // 없음/삭제됨 거부
      await this.assertStudentExists(dto.studentId); // 없는/삭제된 학생 거부
      this.assertWithinPeriod(room, visitAt); // 운영 기간 안인지

      // 같은 학생의 이 자습실 신청 (취소된 것 포함). 학생당 한 자습실에 신청 행은 하나만 둔다.
      const [existing] = await this.visits.findAll(
        (v) => v.roomId === roomId && v.studentId === dto.studentId,
      );
      if (existing?.status === 'ACTIVE') {
        throw new BusinessException('ALREADY_APPLIED'); // 중복 신청
      }
      if (room.currentCount >= room.maxPersonnel) {
        throw new BusinessException('ROOM_FULL'); // 정원 초과
      }

      const now = this.clock.now().toISOString();
      // 취소했던 신청이 있으면 그 행을 다시 ACTIVE 로 되살리고, 없으면 새로 만든다.
      const reservation = existing
        ? await this.visits.update({
            ...existing,
            status: 'ACTIVE',
            visitAt,
            updatedAt: now,
          })
        : await this.visits.create({
            roomId,
            studentId: dto.studentId,
            visitAt,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
          });

      await this.recordHistory(reservation, 'CREATE', null, visitAt, now);
      await this.changeCount(room, +1, now);
      return reservation;
    });
  }

  /** FR-VST-02 / FN-VST-02: 방문 시간 수정 (운영 기간 안에서만). 인원은 변하지 않는다. */
  update(id: number, dto: UpdateVisitDto): Promise<VisitReservation> {
    const visitAt = this.toIso(dto.visitAt);
    return this.db.transaction(async () => {
      const visit = await this.getOwnedVisitOrThrow(id, dto.studentId);
      if (visit.status === 'CANCELLED') {
        throw new BusinessException('VISIT_ALREADY_CANCELLED');
      }
      const room = await this.getActiveRoomOrThrow(visit.roomId);
      this.assertWithinPeriod(room, visitAt);

      if (visit.visitAt === visitAt) return visit; // 바뀐 게 없으면 이력도 남기지 않는다

      const now = this.clock.now().toISOString();
      const updated = await this.visits.update({
        ...visit,
        visitAt,
        updatedAt: now,
      });
      await this.recordHistory(updated, 'UPDATE', visit.visitAt, visitAt, now);
      // 인원은 그대로지만 자습실 행을 "건드려서" version 을 올린다.
      // 자습실의 운영 기간을 바꾸는 요청과 동시에 일어나면 한쪽이 충돌로 감지되어 다시 검사하게 하려는 것.
      await this.rooms.update(room);
      return updated;
    });
  }

  /**
   * FR-VST-03 / FN-VST-03: 방문 취소 (정원 복원).
   * 자습실이 삭제된 뒤에도 취소는 허용한다 (신청·수정만 막는다).
   */
  cancel(id: number, dto: CancelVisitDto): Promise<VisitReservation> {
    return this.db.transaction(async () => {
      const visit = await this.getOwnedVisitOrThrow(id, dto.studentId);
      if (visit.status === 'CANCELLED') {
        throw new BusinessException('VISIT_ALREADY_CANCELLED');
      }
      const room = await this.getRoomOrThrow(visit.roomId);

      const now = this.clock.now().toISOString();
      const cancelled = await this.visits.update({
        ...visit,
        status: 'CANCELLED',
        updatedAt: now,
      });
      await this.recordHistory(cancelled, 'CANCEL', visit.visitAt, null, now);
      await this.changeCount(room, -1, now);
      return cancelled;
    });
  }

  /** FR-ROM-03 / FN-ROM-03: 자습실의 신청·수정·취소 이력 (시간순). 삭제된 자습실도 조회 가능. */
  async findHistories(roomId: number): Promise<VisitHistoryView[]> {
    await this.getRoomOrThrow(roomId);
    const histories = await this.histories.findAll((h) => h.roomId === roomId);
    // 이름은 삭제된 학생도 보여 주려고 전체 학생에서 찾는다
    const students = await this.students.findAll();
    const names = new Map(students.map((s) => [s.id, s.name]));
    return histories
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .map((h) => ({ ...h, studentName: names.get(h.studentId) ?? null }));
  }

  /** FR-VST-04 / FN-VST-04: 학생 본인의 신청 목록 */
  async findByStudent(studentId: number): Promise<VisitView[]> {
    await this.assertStudentExists(studentId);
    const visits = await this.visits.findAll((v) => v.studentId === studentId);
    const rooms = await this.rooms.findAll();
    const names = new Map(rooms.map((r) => [r.id, r.name]));
    return visits.map((v) => ({ ...v, roomName: names.get(v.roomId) ?? null }));
  }

  /**
   * 자습실의 현재 인원을 바꾸는 "유일한" 곳. (신청 +1, 취소 -1)
   * 숫자가 어긋나는 실수를 조용히 넘기지 않도록, 범위를 벗어나면 예외를 던져 트랜잭션 전체를 취소한다.
   */
  private async changeCount(room: StudyRoom, delta: 1 | -1, now: string) {
    const next = room.currentCount + delta;
    if (next < 0 || next > room.maxPersonnel) {
      throw new Error(
        `정합성 오류: 자습실#${room.id} 인원이 ${room.currentCount} → ${next} 로 범위를 벗어남 (최대 ${room.maxPersonnel})`,
      );
    }
    await this.rooms.update({ ...room, currentCount: next, updatedAt: now });
  }

  // 이력은 추가만 한다 (수정·삭제 없음). roomId·studentId 는 조회 편의를 위해 함께 저장한다.
  private async recordHistory(
    reservation: VisitReservation,
    action: VisitAction,
    beforeVisitAt: string | null,
    afterVisitAt: string | null,
    now: string,
  ) {
    await this.histories.create({
      reservationId: reservation.id,
      roomId: reservation.roomId,
      studentId: reservation.studentId,
      action,
      beforeVisitAt,
      afterVisitAt,
      createdAt: now,
    });
  }

  // 신청을 찾고 본인 것인지 확인한다 (로그인이 없어서 studentId 로 대신 확인)
  private async getOwnedVisitOrThrow(id: number, studentId: number) {
    const visit = await this.visits.findById(id);
    if (!visit) throw new BusinessException('VISIT_NOT_FOUND');
    if (visit.studentId !== studentId) {
      throw new BusinessException('NOT_VISIT_OWNER');
    }
    return visit;
  }

  private async getRoomOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.rooms.findById(id);
    if (!room) throw new BusinessException('ROOM_NOT_FOUND');
    return room;
  }

  // 신청·수정은 삭제된 자습실에는 할 수 없다
  private async getActiveRoomOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.getRoomOrThrow(id);
    if (room.deletedAt !== null) throw new BusinessException('ROOM_DELETED');
    return room;
  }

  private async assertStudentExists(studentId: number) {
    const student = await this.students.findById(studentId);
    if (!student || student.deletedAt !== null) {
      throw new BusinessException('STUDENT_NOT_FOUND');
    }
  }

  // 방문 시간은 운영 기간 안이어야 한다 (시작·종료 시각 자체는 포함)
  private assertWithinPeriod(room: StudyRoom, visitAt: string) {
    if (visitAt < room.startDate || visitAt > room.endDate) {
      throw new BusinessException('OUT_OF_PERIOD');
    }
  }

  private toIso(value: string): string {
    return new Date(value).toISOString();
  }
}
