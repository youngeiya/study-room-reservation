import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import type { Repository } from '../storage/repository';
import { VISIT_REPOSITORY, VisitReservation } from '../visit/visit.entity';
import { CreateStudyRoomDto } from './dto/create-study-room.dto';
import { UpdateStudyRoomDto } from './dto/update-study-room.dto';
import {
  STUDY_ROOM_REPOSITORY,
  StudyRoom,
  StudyRoomView,
} from './study-room.entity';

@Injectable()
export class StudyRoomService {
  constructor(
    @Inject(STUDY_ROOM_REPOSITORY)
    private readonly rooms: Repository<StudyRoom>,
    @Inject(VISIT_REPOSITORY)
    private readonly visits: Repository<VisitReservation>,
    private readonly db: JsonDatabase,
    private readonly clock: Clock,
  ) {}

  /** FR-ROM-01 / FN-ROM-01: 삭제되지 않은 자습실 + 현재 신청 인원 */
  async findAll(): Promise<StudyRoomView[]> {
    const rooms = await this.rooms.findAll((r) => r.deletedAt === null);
    const active = await this.visits.findAll((v) => v.status === 'ACTIVE');
    return rooms.map((room) => ({
      ...room,
      currentPersonnel: active.filter((v) => v.roomId === room.id).length,
    }));
  }

  /** 상세 조회. 삭제된 자습실도 이력 확인을 위해 조회는 허용한다. */
  async findOne(id: number): Promise<StudyRoomView> {
    const room = await this.getOrThrow(id);
    const active = await this.visits.findAll(
      (v) => v.roomId === id && v.status === 'ACTIVE',
    );
    return { ...room, currentPersonnel: active.length };
  }

  /** FR-ROM-02 / FN-ROM-02 */
  async create(dto: CreateStudyRoomDto): Promise<StudyRoom> {
    const startDate = this.toIso(dto.startDate);
    const endDate = this.toIso(dto.endDate);
    this.assertValidPeriod(startDate, endDate);

    const now = this.clock.now().toISOString();
    return this.db.transaction(() =>
      this.rooms.create({
        name: dto.name,
        maxPersonnel: dto.maxPersonnel,
        startDate,
        endDate,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
  }

  /**
   * FR-ROM-04 / FR-ROM-06
   * 기존 신청이 규칙을 벗어나게 되는 수정은 거부한다 (자동으로 신청을 바꾸거나 취소하지 않음).
   */
  update(id: number, dto: UpdateStudyRoomDto): Promise<StudyRoom> {
    return this.db.transaction(async () => {
      const room = await this.getActiveOrThrow(id);
      const next: StudyRoom = {
        ...room,
        name: dto.name ?? room.name,
        maxPersonnel: dto.maxPersonnel ?? room.maxPersonnel,
        startDate: dto.startDate ? this.toIso(dto.startDate) : room.startDate,
        endDate: dto.endDate ? this.toIso(dto.endDate) : room.endDate,
        updatedAt: this.clock.now().toISOString(),
      };
      this.assertValidPeriod(next.startDate, next.endDate);

      const active = await this.visits.findAll(
        (v) => v.roomId === id && v.status === 'ACTIVE',
      );
      if (next.maxPersonnel < active.length) {
        throw new BusinessException('CAPACITY_BELOW_APPLIED', {
          currentPersonnel: active.length,
        });
      }
      // 같은 형식(UTC ISO)의 문자열이라 사전순 비교가 곧 시간순 비교다.
      const outOfPeriod = active.filter(
        (v) => v.visitAt < next.startDate || v.visitAt > next.endDate,
      );
      if (outOfPeriod.length > 0) {
        throw new BusinessException('PERIOD_CONFLICTS_VISITS', {
          visitIds: outOfPeriod.map((v) => v.id),
        });
      }

      return this.rooms.update(next);
    });
  }

  /** FR-ROM-05 / FN-ROM-04: Soft Delete. 기존 신청과 이력은 그대로 남긴다. */
  remove(id: number): Promise<void> {
    return this.db.transaction(async () => {
      const room = await this.getActiveOrThrow(id);
      const now = this.clock.now().toISOString();
      await this.rooms.update({ ...room, deletedAt: now, updatedAt: now });
    });
  }

  private async getOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.rooms.findById(id);
    if (!room) throw new BusinessException('ROOM_NOT_FOUND');
    return room;
  }

  private async getActiveOrThrow(id: number): Promise<StudyRoom> {
    const room = await this.getOrThrow(id);
    if (room.deletedAt !== null) throw new BusinessException('ROOM_DELETED');
    return room;
  }

  private assertValidPeriod(startDate: string, endDate: string) {
    if (startDate >= endDate) throw new BusinessException('INVALID_PERIOD');
  }

  /** 입력(타임존이 섞여 있을 수 있음)을 UTC ISO 문자열 하나로 통일한다. */
  private toIso(value: string): string {
    return new Date(value).toISOString();
  }
}
