import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { ImageStorage, StoredImage } from '../image/image-storage';
import { Database } from '../storage/database';
import type { Repository } from '../storage/repository';
import { VISIT_REPOSITORY, VisitReservation } from '../visit/visit.entity';
import { CreateStudyRoomDto } from './dto/create-study-room.dto';
import { UpdateStudyRoomDto } from './dto/update-study-room.dto';
import { DEFAULT_BRANCH } from './branch';
import type { BranchCode } from './branch';
import { STUDY_ROOM_REPOSITORY, StudyRoom } from './study-room.entity';

// 처음 실행할 때 넣어 둘 예시 자습실 (정원 10명, 10명, 5명).
// 지점이 골고루 보이도록 H관·S관·목동에 하나씩 둔다 (반포는 비어 있는 지점의 예시).
const SEED_ROOMS: {
  name: string;
  branch: BranchCode;
  maxPersonnel: number;
}[] = [
  { name: '부엉이 라이브러리 1관', branch: 'H', maxPersonnel: 10 },
  { name: '부엉이 라이브러리 2관', branch: 'S', maxPersonnel: 10 },
  {
    name: '부엉이 라이브러리 3관 (소수 정예)',
    branch: 'MOKDONG',
    maxPersonnel: 5,
  },
];
// 올릴 수 있는 사진 형식. 파일 내용의 첫 바이트(매직 넘버)로 판별한다 (확장자·Content-Type 은 속일 수 있어서)
function sniffImage(data: Buffer): { ext: string; contentType: string } | null {
  if (
    data.length > 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return { ext: 'jpg', contentType: 'image/jpeg' };
  if (
    data.length > 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { ext: 'png', contentType: 'image/png' };
  if (
    data.length > 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return { ext: 'webp', contentType: 'image/webp' };
  return null;
}

// 운영 기간 최대 길이(일). 입력 실수 방지용 상한
const MAX_PERIOD_DAYS = 366;

// 예시 자습실의 운영 기간: 어제부터 30일 뒤까지 (언제 실행해도 바로 신청해 볼 수 있게 현재 시각 기준)
const SEED_PERIOD_BEFORE_DAYS = 1;
const SEED_PERIOD_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 자습실의 업무 규칙이 모여 있는 곳.
 * 규칙 위반은 BusinessException 을 던지고, 쓰기는 항상 db.transaction 안에서 한다.
 * 현재 신청 인원(currentCount)은 방문 신청 서비스(VisitService)만 바꾼다. 여기서는 읽기만 한다.
 */
@Injectable()
export class StudyRoomService implements OnModuleInit {
  private readonly logger = new Logger(StudyRoomService.name);

  constructor(
    @Inject(STUDY_ROOM_REPOSITORY)
    private readonly rooms: Repository<StudyRoom>,
    // 운영 기간을 바꿀 때 "기간 밖으로 밀려나는 신청이 있는지" 확인하려고 신청 저장소를 읽는다
    @Inject(VISIT_REPOSITORY)
    private readonly visits: Repository<VisitReservation>,
    private readonly db: Database,
    private readonly clock: Clock,
    // 자습실 사진 파일 저장소 (SeaweedFS). DB 에는 경로(imageKey)만 둔다.
    private readonly images: ImageStorage,
  ) {}

  /**
   * 처음 실행했을 때 화면이 비어 보이지 않도록 예시 자습실을 넣는다.
   * 삭제된 자습실(Soft Delete 라 행이 남아 있음)까지 포함해 "한 건도 없을 때만" 넣으므로,
   * 사용자가 자습실을 모두 지워도 재시작할 때 다시 생기지 않는다.
   */
  async onModuleInit() {
    const existing = await this.rooms.findAll();
    if (existing.length > 0) {
      // 지점이 정해지기 전에 만든 자습실은 기본 지점(H관)으로 채운다 (강사가 자습실 수정에서 바꿀 수 있다)
      const targets = existing.filter(
        (r) => (r as Partial<StudyRoom>).branch === undefined,
      );
      if (targets.length > 0) {
        await this.db.transaction(async () => {
          for (const r of targets) {
            await this.rooms.update({ ...r, branch: DEFAULT_BRANCH });
          }
        });
      }
      return;
    }
    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const startDate = new Date(
      nowDate.getTime() - SEED_PERIOD_BEFORE_DAYS * DAY_MS,
    ).toISOString();
    const endDate = new Date(
      nowDate.getTime() + SEED_PERIOD_AFTER_DAYS * DAY_MS,
    ).toISOString();
    await this.db.transaction(async () => {
      for (const seed of SEED_ROOMS) {
        await this.rooms.create({
          ...seed,
          currentCount: 0,
          imageKey: null,
          startDate,
          endDate,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    });
  }

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
    this.assertNotEnded(endDate); // 이미 끝난 기간으로는 새 자습실을 만들 수 없다

    const now = this.clock.now().toISOString();
    // 쓰기는 트랜잭션 안에서. 콜백이 반환한 값(저장된 자습실)이 그대로 결과가 된다.
    return this.db.transaction(() =>
      this.rooms.create({
        name: dto.name,
        branch: dto.branch,
        maxPersonnel: dto.maxPersonnel,
        currentCount: 0, // 새 자습실은 신청이 없다
        imageKey: null, // 사진은 등록 후 따로 올린다
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
        branch: dto.branch ?? room.branch ?? DEFAULT_BRANCH,
        maxPersonnel: dto.maxPersonnel ?? room.maxPersonnel,
        startDate: dto.startDate ? this.toIso(dto.startDate) : room.startDate,
        endDate: dto.endDate ? this.toIso(dto.endDate) : room.endDate,
        updatedAt: this.clock.now().toISOString(),
      };
      // 일부만 수정해도 합쳐진 결과(next)로 시작 < 종료 를 검사해야 한다
      this.assertValidPeriod(next.startDate, next.endDate);
      // 종료 일시를 바꾸는 경우에만 검사한다 (이미 끝난 자습실의 이름 등 다른 정보는 계속 수정할 수 있게)
      if (dto.endDate) this.assertNotEnded(next.endDate);

      // 규칙 0) 신청이 남아 있는 자습실은 지점을 옮길 수 없다 (학생이 가기로 한 장소가 바뀌어 버리므로,
      //        강사가 먼저 신청을 정리하게 한다. 운영 기간·정원 규칙과 같은 원칙)
      if (
        next.branch !== (room.branch ?? DEFAULT_BRANCH) &&
        room.currentCount > 0
      ) {
        throw new BusinessException('BRANCH_CHANGE_HAS_VISITS', {
          currentCount: room.currentCount,
        });
      }
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

  /**
   * 자습실 사진 등록·교체 (강사). 파일은 SeaweedFS 에, 경로만 DB 에 저장한다.
   * 순서: 새 파일 저장 → DB 의 경로 교체 → 옛 파일 삭제. DB 저장이 실패하면 방금 올린 파일을 치워서 고아 파일이 남지 않게 한다.
   */
  async setImage(id: number, data: Buffer): Promise<StudyRoom> {
    const kind = sniffImage(data);
    if (!kind) throw new BusinessException('IMAGE_INVALID');
    // 파일 이름에 랜덤 값을 넣어서, 교체하면 주소가 바뀐다 (브라우저 캐시가 옛 사진을 보여 주지 않게)
    const key = `rooms/${id}-${randomUUID()}.${kind.ext}`;

    await this.getActiveOrThrow(id); // 삭제된 자습실에는 올리지 않는다 (저장소에 쓰기 전에 확인)
    await this.images.put(key, data, kind.contentType);

    let oldKey: string | null = null;
    try {
      const updated = await this.db.transaction(async () => {
        const room = await this.getActiveOrThrow(id);
        oldKey = room.imageKey ?? null;
        return this.rooms.update({
          ...room,
          imageKey: key,
          updatedAt: this.clock.now().toISOString(),
        });
      });
      await this.discard(oldKey);
      return updated;
    } catch (error) {
      await this.discard(key);
      throw error;
    }
  }

  /** 자습실 사진 삭제 (강사). 사진이 없어도 오류가 아니다. */
  async removeImage(id: number): Promise<StudyRoom> {
    let oldKey: string | null = null;
    const updated = await this.db.transaction(async () => {
      const room = await this.getActiveOrThrow(id);
      oldKey = room.imageKey ?? null;
      return this.rooms.update({
        ...room,
        imageKey: null,
        updatedAt: this.clock.now().toISOString(),
      });
    });
    await this.discard(oldKey);
    return updated;
  }

  /** 자습실 사진 내용. 사진이 없으면 IMAGE_NOT_FOUND (삭제된 자습실도 이력용으로 조회는 가능). */
  async getImage(id: number): Promise<StoredImage> {
    const room = await this.getOrThrow(id);
    if (!room.imageKey) throw new BusinessException('IMAGE_NOT_FOUND');
    const image = await this.images.get(room.imageKey);
    if (!image) throw new BusinessException('IMAGE_NOT_FOUND');
    return image;
  }

  // 저장소 파일 정리는 "최선을 다해서". 실패해도 사용자 작업은 성공으로 두고 로그만 남긴다
  private async discard(key: string | null) {
    if (!key) return;
    try {
      await this.images.delete(key);
    } catch {
      this.logger.warn(
        `사진 파일 정리 실패 (고아 파일로 남을 수 있음): ${key}`,
      );
    }
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
    // 터무니없이 긴 운영 기간(입력 실수)을 막는다
    if (
      Date.parse(endDate) - Date.parse(startDate) >
      MAX_PERIOD_DAYS * DAY_MS
    ) {
      throw new BusinessException('PERIOD_TOO_LONG');
    }
  }

  // 종료 일시가 지금보다 과거인 자습실은 아무도 신청할 수 없으므로 만들지 않는다
  private assertNotEnded(endDate: string) {
    if (Date.parse(endDate) < this.clock.now().getTime()) {
      throw new BusinessException('ROOM_ALREADY_ENDED');
    }
  }

  /** 입력(타임존이 섞여 있을 수 있음)을 UTC ISO 문자열 하나로 통일한다. */
  private toIso(value: string): string {
    return new Date(value).toISOString();
  }
}
