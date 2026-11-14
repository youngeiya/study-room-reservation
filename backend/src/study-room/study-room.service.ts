import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import type { Repository } from '../storage/repository';
import { VISIT_REPOSITORY, VisitReservation } from '../visit/visit.entity';
import { CreateStudyRoomDto } from './dto/create-study-room.dto';
import { UpdateStudyRoomDto } from './dto/update-study-room.dto';
import { STUDY_ROOM_REPOSITORY, StudyRoom } from './study-room.entity';

/**
 * 자습실의 업무 규칙이 모여 있는 곳.
 * 규칙 위반은 BusinessException 을 던지고, 쓰기는 항상 db.transaction 안에서 한다.
 * 현재 신청 인원(currentCount)은 방문 신청 서비스(VisitService)만 바꾼다. 여기서는 읽기만 한다.
 */
@Injectable()
export class StudyRoomService {
  constructor(
    @Inject(STUDY_ROOM_REPOSITORY)
    private readonly rooms: Repository<StudyRoom>,
    // 운영 기간을 바꿀 때 "기간 밖으로 밀려나는 신청이 있는지" 확인하려고 신청 저장소를 읽는다
    @Inject(VISIT_REPOSITORY)
    private readonly visits: Repository<VisitReservation>,
    private readonly db: JsonDatabase,
    private readonly clock: Clock,
  ) {}

  /** FR-ROM-01 / FN-ROM-01: 삭제되지 않은 자습실 (currentCount 가 현재 신청 인원) */
  findAll(): Promise<StudyRoom[]> {
    return this.rooms.findAll((r) => r.deletedAt === null);
  }

  /** 상세 조회. 삭제된 자습실도 이력 확인을 위해 조회는 허용한다. */
  findOne(id: number): Promise<StudyRoom> {
    return this.getOrThrow(id); // 없으면 ROOM_NOT_FOUND
  }

  /** FR-ROM-02 / FN-ROM-02 */
  async create(dto: CreateStudyRoomDto): Promise<StudyRoom> {
    // 입력 날짜를 UTC ISO 문자열로 통일하고, 시작 < 종료 인지 검사한다 (DTO 는 형식만 검사함)
    const startDate = this.toIso(dto.startDate);
    const endDate = this.toIso(dto.endDate);
    this.assertValidPeriod(startDate, endDate);

    const now = this.clock.now().toISOString();
    // 쓰기는 트랜잭션 안에서. 콜백이 반환한 값(저장된 자습실)이 그대로 결과가 된다.
    return this.db.transaction(() =>
      this.rooms.create({
        name: dto.name,
        maxPersonnel: dto.maxPersonnel,
        currentCount: 0, // 새 자습실은 신청이 없다
        startDate,
        endDate,
        createdAt: now,
        updatedAt: now,
        deletedAt: null, // null = 삭제되지 않음
      }),
    );
  }

  /**
   * FR-ROM-04 / FR-ROM-06
   * 기존 신청이 규칙을 벗어나게 되는 수정은 거부한다 (자동으로 신청을 바꾸거나 취소하지 않음).
   */
  update(id: number, dto: UpdateStudyRoomDto): Promise<StudyRoom> {
    // "읽기 → 검사 → 쓰기"를 하나의 트랜잭션으로 묶는다.
    // 검사 도중 예외가 나면 쓰기는 반영되지 않는다. 그 사이 다른 요청이 이 자습실을 바꿨다면
    // (신청·취소로 currentCount 변경 포함) 커밋 때 version 충돌로 감지되어 처음부터 다시 실행된다.
    return this.db.transaction(async () => {
      // 삭제된 자습실이면 ROOM_DELETED, 없으면 ROOM_NOT_FOUND
      const room = await this.getActiveOrThrow(id);
      // 보낸 값만 덮어쓴 "수정 후 모습" 을 먼저 만든다. (dto.x ?? room.x : 안 보냈으면 기존 값 유지)
      const next: StudyRoom = {
        ...room,
        name: dto.name ?? room.name,
        maxPersonnel: dto.maxPersonnel ?? room.maxPersonnel,
        startDate: dto.startDate ? this.toIso(dto.startDate) : room.startDate,
        endDate: dto.endDate ? this.toIso(dto.endDate) : room.endDate,
        updatedAt: this.clock.now().toISOString(),
      };
      // 일부만 수정해도 합쳐진 결과(next)로 시작 < 종료 를 검사해야 한다
      this.assertValidPeriod(next.startDate, next.endDate);

      // 규칙 1) 최대 인원을 현재 신청 수보다 작게 줄일 수 없다 (같은 값까지는 허용)
      if (next.maxPersonnel < room.currentCount) {
        throw new BusinessException('CAPACITY_BELOW_APPLIED', {
          currentCount: room.currentCount,
        });
      }
      // 규칙 2) 바뀐 운영 기간 밖으로 밀려나는 신청이 있으면 거부하고, 어떤 신청인지 알려 준다
      const active = await this.visits.findAll(
        (v) => v.roomId === id && v.status === 'ACTIVE',
      );
      // 같은 형식(UTC ISO)의 문자열이라 사전순 비교가 곧 시간순 비교다.
      const outOfPeriod = active.filter(
        (v) => v.visitAt < next.startDate || v.visitAt > next.endDate,
      );
      if (outOfPeriod.length > 0) {
        throw new BusinessException('PERIOD_CONFLICTS_VISITS', {
          visitIds: outOfPeriod.map((v) => v.id),
        });
      }

      // 모든 검사를 통과했을 때만 저장한다
      return this.rooms.update(next);
    });
  }

  /** FR-ROM-05 / FN-ROM-04: Soft Delete. 기존 신청과 이력은 그대로 남긴다. */
  remove(id: number): Promise<void> {
    return this.db.transaction(async () => {
      const room = await this.getActiveOrThrow(id); // 이미 삭제된 자습실이면 ROOM_DELETED
      const now = this.clock.now().toISOString();
      // 행을 지우지 않고 deletedAt 만 채운다 → 목록·신청 대상에서는 빠지지만 이력은 조회 가능
      await this.rooms.update({ ...room, deletedAt: now, updatedAt: now });
    });
  }

  // 자습실을 찾는다. 삭제 여부와 상관없이 있기만 하면 반환 (상세·이력 조회용)
  private async getOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.rooms.findById(id);
    if (!room) throw new BusinessException('ROOM_NOT_FOUND');
    return room;
  }

  // 수정·삭제처럼 "살아 있는 자습실"이어야 하는 작업용. 삭제된 자습실이면 거부한다.
  private async getActiveOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.getOrThrow(id);
    if (room.deletedAt !== null) throw new BusinessException('ROOM_DELETED');
    return room;
  }

  // 시작이 종료보다 빨라야 한다. (같아도 안 됨)
  private assertValidPeriod(startDate: string, endDate: string) {
    if (startDate >= endDate) throw new BusinessException('INVALID_PERIOD');
  }

  /** 입력(타임존이 섞여 있을 수 있음)을 UTC ISO 문자열 하나로 통일한다. */
  private toIso(value: string): string {
    return new Date(value).toISOString();
  }
}
