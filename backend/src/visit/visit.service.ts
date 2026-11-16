import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { Database } from '../storage/database';
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
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 예약 가능 기간(일). 지금부터 이 일수 안의 방문 시간만 신청·수정할 수 있다 (기본 3일).
 * 학원 정책에 따라 환경 변수 BOOKING_MAX_DAYS_AHEAD 로 바꾼다. 잘못된 값이면 기본값.
 */
export const DEFAULT_MAX_DAYS_AHEAD = 3;
export function maxDaysAhead(): number {
  const n = Number(process.env.BOOKING_MAX_DAYS_AHEAD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DAYS_AHEAD;
}

// "하루"의 기준은 한국 시간(UTC+9). 방문 시각(UTC)을 한국 날짜(YYYY-MM-DD)로 바꿔 같은 날인지 비교한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function kstDay(visitAtIso: string): string {
  return new Date(Date.parse(visitAtIso) + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

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
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** FR-VST-01 / FN-VST-01: 방문 신청 (운영 기간·정원·중복 검사) */
  create(roomId: number, dto: CreateVisitDto): Promise<VisitReservation> {
    const visitAt = this.toIso(dto.visitAt);
    // 재시도 때 처음부터 다시 실행되므로, 필요한 값은 모두 이 안에서 새로 읽는다.
    return this.db.transaction(async () => {
      const room = await this.getActiveRoomOrThrow(roomId); // 없음/삭제됨 거부
      const student = await this.getActiveStudentOrThrow(dto.studentId); // 없는/삭제된 학생 거부
      if (student.status !== 'ENROLLED') {
        throw new BusinessException('STUDENT_NOT_ENROLLED'); // 휴원·퇴원 학생은 신청 불가
      }
      this.assertWithinPeriod(room, visitAt); // 운영 기간 안인지
      this.assertBookable(visitAt); // 지금부터 N일 이내인지 (과거·너무 먼 날짜 거부)

      // 한 학생은 하루(한국 시간 기준)에 활성 신청을 한 건만 가질 수 있다 (자습실이 달라도 마찬가지).
      // 다른 날짜의 신청은 따로 할 수 있다.
      await this.assertNoOtherVisitThatDay(dto.studentId, visitAt, roomId);
      if (room.currentCount >= room.maxPersonnel) {
        throw new BusinessException('ROOM_FULL'); // 정원 초과
      }

      const now = this.clock.now().toISOString();
      // 신청은 항상 새 행으로 만든다 (취소된 옛 신청은 그대로 남아 이력과 맞는다)
      const reservation = await this.visits.create({
        roomId,
        studentId: dto.studentId,
        visitAt,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });

      await this.recordHistory(reservation, 'CREATE', null, visitAt, now);
      await this.changeCount(room, +1, now);
      // 같은 학생이 같은 날 서로 다른 자습실에 동시에 신청하는 경우를 잡으려고 학생 행도 "건드려서" version 을 올린다.
      // (자습실 행은 방마다 달라서, 방이 다르면 자습실 version 검사만으로는 충돌이 감지되지 않는다.
      //  학생 행이 "하루에 활성 신청은 한 건" 규칙의 문지기 역할을 한다)
      await this.students.update(student);
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
      this.assertBookable(visitAt); // 바꾸려는 시간도 같은 예약 가능 기간 안이어야 한다
      // 옮겨 가는 날짜에 이미 다른 활성 신청이 있으면 거부한다 (자기 자신은 제외)
      await this.assertNoOtherVisitThatDay(
        visit.studentId,
        visitAt,
        visit.roomId,
        visit.id,
      );

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
      // 같은 학생의 다른 신청과 동시에 같은 날로 옮기는 경우를 잡으려고 학생 행도 건드린다 (신청 때와 같은 이유)
      await this.students.update(
        await this.getActiveStudentOrThrow(visit.studentId),
      );
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

  /**
   * 같은 날(한국 시간)에 이 학생의 다른 활성 신청이 있으면 거부한다.
   * 같은 자습실이면 ALREADY_APPLIED, 다른 자습실이면 ALREADY_APPLIED_OTHER_ROOM(어느 자습실인지 포함).
   */
  private async assertNoOtherVisitThatDay(
    studentId: number,
    visitAt: string,
    roomId: number,
    exceptVisitId?: number,
  ) {
    const day = kstDay(visitAt);
    const sameDay = await this.visits.findAll(
      (v) =>
        v.studentId === studentId &&
        v.status === 'ACTIVE' &&
        v.id !== exceptVisitId &&
        kstDay(v.visitAt) === day,
    );
    const other = sameDay[0];
    if (!other) return;
    throw other.roomId === roomId
      ? new BusinessException('ALREADY_APPLIED', { visitId: other.id, day })
      : new BusinessException('ALREADY_APPLIED_OTHER_ROOM', {
          roomId: other.roomId,
          day,
        });
  }

  // 신청·수정은 삭제된 자습실에는 할 수 없다
  private async getActiveRoomOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.getRoomOrThrow(id);
    if (room.deletedAt !== null) throw new BusinessException('ROOM_DELETED');
    return room;
  }

  private async assertStudentExists(studentId: number) {
    await this.getActiveStudentOrThrow(studentId);
  }

  private async getActiveStudentOrThrow(studentId: number): Promise<Student> {
    const student = await this.students.findById(studentId);
    if (!student || student.deletedAt !== null) {
      throw new BusinessException('STUDENT_NOT_FOUND');
    }
    return student;
  }

  /**
   * 예약 가능 기간: 지금 <= 방문 시각 <= 지금 + N일 (경계 포함).
   * 자습실 운영 기간과는 별개의 규칙이다 (운영 기간이 한 달이어도 신청은 가까운 날짜만 받는다).
   * 시각은 주입받은 Clock 으로 얻어서 테스트에서 고정할 수 있다.
   */
  private assertBookable(visitAt: string) {
    const now = this.clock.now().getTime();
    const at = new Date(visitAt).getTime();
    if (at < now) throw new BusinessException('VISIT_IN_PAST');
    const days = maxDaysAhead();
    if (at > now + days * DAY_MS) {
      throw new BusinessException('VISIT_TOO_FAR', { maxDaysAhead: days });
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
