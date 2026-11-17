import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock } from '../common/clock.service';
import { InMemoryImageStorage } from '../image/in-memory-image-storage';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { VISIT_COLLECTION, VisitReservation } from '../visit/visit.entity';
import { STUDY_ROOM_COLLECTION, StudyRoom } from './study-room.entity';
import { StudyRoomService } from './study-room.service';

const NOW = '2026-11-13T00:00:00.000Z';
const base = {
  name: '1자습실',
  hall: 'MAIN' as const,
  maxPersonnel: 3,
  startDate: '2026-11-20T00:00:00.000Z',
  endDate: '2026-11-30T00:00:00.000Z',
};

describe('StudyRoomService', () => {
  let dir: string;
  let db: JsonDatabase;
  let rooms: JsonRepository<StudyRoom>;
  let visits: JsonRepository<VisitReservation>;
  let service: StudyRoomService;
  let images: InMemoryImageStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'room-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    rooms = new JsonRepository<StudyRoom>(db, STUDY_ROOM_COLLECTION);
    visits = new JsonRepository<VisitReservation>(db, VISIT_COLLECTION);
    images = new InMemoryImageStorage();
    // 시각을 고정한 Clock (서비스가 new Date()를 직접 쓰지 않는 이점)
    const clock = { now: () => new Date(NOW) } as Clock;
    service = new StudyRoomService(rooms, visits, db, clock, images);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  // 이 테스트는 자습실 서비스만 검증하므로, "신청이 이미 있는 상태"를 저장소로 직접 만든다.
  // (실제 신청 흐름과 인원 갱신은 visit.service.spec.ts 에서 검증)
  const addVisit = (
    roomId: number,
    studentId: number,
    visitAt = '2026-11-25T00:00:00.000Z',
  ) =>
    db.transaction(async () => {
      const visit = await visits.create({
        roomId,
        studentId,
        visitAt,
        status: 'ACTIVE',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const room = (await rooms.findById(roomId))!;
      await rooms.update({ ...room, currentCount: room.currentCount + 1 });
      return visit;
    });

  it('처음 실행하면 예시 자습실이 들어가고, 재시작해도 중복되지 않는다', async () => {
    await service.onModuleInit();
    const seeded = await service.findAll();
    expect(seeded.map((r) => r.maxPersonnel)).toEqual([10, 10, 5]);
    expect(seeded.every((r) => r.currentCount === 0)).toBe(true);
    // 운영 기간은 (고정된) 현재 시각을 포함한다
    expect(seeded[0].startDate < NOW && NOW < seeded[0].endDate).toBe(true);

    await service.onModuleInit();
    expect(await service.findAll()).toHaveLength(3);
  });

  it('자습실을 모두 삭제해도(Soft Delete) 재시작할 때 예시가 다시 생기지 않는다', async () => {
    await service.onModuleInit();
    for (const room of await service.findAll()) await service.remove(room.id);

    await service.onModuleInit();
    expect(await service.findAll()).toHaveLength(0);
  });

  describe('종료된 기간과 입력 상한', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const nowMs = Date.parse(NOW);
    const at = (offsetMs: number) => new Date(nowMs + offsetMs).toISOString();

    it('종료 일시가 이미 지난 자습실은 등록할 수 없고, 지금 이후면 등록된다', async () => {
      await expect(
        service.create({ ...base, startDate: at(-10 * DAY), endDate: at(-1) }),
      ).rejects.toMatchObject({ code: 'ROOM_ALREADY_ENDED' });
      await expect(
        service.create({ ...base, startDate: at(-10 * DAY), endDate: at(0) }),
      ).resolves.toBeDefined(); // 종료가 지금과 같으면 허용 (경계)
    });

    it('종료 일시를 과거로 바꾸는 수정은 거부하지만, 이미 끝난 자습실의 이름 수정은 허용한다', async () => {
      const room = await service.create({
        ...base,
        startDate: at(-10 * DAY),
        endDate: at(5 * DAY),
      });
      await expect(
        service.update(room.id, { endDate: at(-1) }),
      ).rejects.toMatchObject({ code: 'ROOM_ALREADY_ENDED' });

      // 이미 끝난 자습실(시드로 직접 만든 것처럼)의 다른 정보 수정은 막지 않는다
      const ended = await db.transaction(() =>
        rooms.create({
          name: '끝난 자습실',
          hall: 'MAIN' as const,
          maxPersonnel: 3,
          currentCount: 0,
          imageKey: null,
          startDate: at(-20 * DAY),
          endDate: at(-10 * DAY),
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        }),
      );
      await expect(
        service.update(ended.id, { name: '이름만 변경' }),
      ).resolves.toMatchObject({ name: '이름만 변경' });
    });

    it('운영 기간은 최대 366일까지, 그보다 길면 PERIOD_TOO_LONG', async () => {
      await expect(
        service.create({ ...base, startDate: at(0), endDate: at(366 * DAY) }),
      ).resolves.toBeDefined();
      await expect(
        service.create({
          ...base,
          startDate: at(0),
          endDate: at(366 * DAY + 1),
        }),
      ).rejects.toMatchObject({ code: 'PERIOD_TOO_LONG' });

      const room = await service.create({
        ...base,
        startDate: at(0),
        endDate: at(10 * DAY),
      });
      await expect(
        service.update(room.id, { endDate: at(400 * DAY) }),
      ).rejects.toMatchObject({ code: 'PERIOD_TOO_LONG' });
    });
  });

  it('시작이 종료보다 늦거나 같으면 등록할 수 없다', async () => {
    await expect(
      service.create({ ...base, startDate: base.endDate }),
    ).rejects.toMatchObject({ code: 'INVALID_PERIOD' });
  });

  it('등록하면 날짜가 UTC ISO로 통일되고, 현재 인원은 0으로 시작한다', async () => {
    const room = await service.create({
      ...base,
      startDate: '2026-11-20T09:00:00+09:00',
    });
    expect(room.startDate).toBe('2026-11-20T00:00:00.000Z');
    expect(room.createdAt).toBe(NOW);
    expect(room.currentCount).toBe(0);
  });

  it('목록은 삭제된 자습실을 빼고 현재 인원을 보여 준다', async () => {
    const a = await service.create(base);
    const b = await service.create(base);
    await addVisit(a.id, 1);
    await addVisit(a.id, 2);
    await service.remove(b.id);

    const list = await service.findAll();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.id, currentCount: 2 });
  });

  it('없는 자습실은 ROOM_NOT_FOUND', async () => {
    await expect(service.findOne(999)).rejects.toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('삭제된 자습실은 상세 조회는 되지만 수정·재삭제는 ROOM_DELETED', async () => {
    const room = await service.create(base);
    await service.remove(room.id);
    expect((await service.findOne(room.id)).deletedAt).toBe(NOW);
    await expect(service.update(room.id, { name: 'x' })).rejects.toMatchObject({
      code: 'ROOM_DELETED',
    });
    await expect(service.remove(room.id)).rejects.toMatchObject({
      code: 'ROOM_DELETED',
    });
  });

  it('최대 인원을 현재 신청 수보다 작게 줄이면 거부한다', async () => {
    const room = await service.create(base);
    await addVisit(room.id, 1);
    await addVisit(room.id, 2);
    await expect(
      service.update(room.id, { maxPersonnel: 1 }),
    ).rejects.toMatchObject({
      code: 'CAPACITY_BELOW_APPLIED',
      data: { currentCount: 2 },
    });
    // 같은 값까지는 허용
    await expect(
      service.update(room.id, { maxPersonnel: 2 }),
    ).resolves.toMatchObject({ maxPersonnel: 2 });
  });

  it('운영 기간을 바꿔 기존 신청이 기간 밖이 되면 거부하고 해당 신청을 알려 준다', async () => {
    const room = await service.create(base);
    const inside = await addVisit(room.id, 1, '2026-11-22T00:00:00.000Z');
    const outside = await addVisit(room.id, 2, '2026-11-28T00:00:00.000Z');
    await expect(
      service.update(room.id, { endDate: '2026-11-25T00:00:00.000Z' }),
    ).rejects.toMatchObject({
      code: 'PERIOD_CONFLICTS_VISITS',
      data: { visitIds: [outside.id] },
    });
    expect(inside.id).not.toBe(outside.id);
  });

  it('거부된 수정은 아무것도 바꾸지 않는다 (롤백)', async () => {
    const room = await service.create(base);
    await addVisit(room.id, 1);
    await addVisit(room.id, 2);
    await expect(
      service.update(room.id, { name: '변경', maxPersonnel: 1 }),
    ).rejects.toBeDefined();
    expect((await service.findOne(room.id)).name).toBe('1자습실');
  });

  describe('사진', () => {
    const PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('fake-png-body'),
    ]);
    const JPG = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('fake-jpg-body'),
    ]);

    it('사진을 올리면 저장소에 파일이 생기고 DB 에는 경로만 저장된다', async () => {
      const room = await service.create({ ...base });
      const updated = await service.setImage(room.id, PNG);

      expect(updated.imageKey).toMatch(
        new RegExp(`^rooms/${room.id}-.+\\.png$`),
      );
      expect(images.files.get(updated.imageKey!)?.contentType).toBe(
        'image/png',
      );
      const image = await service.getImage(room.id);
      expect(image.data.equals(PNG)).toBe(true);
    });

    it('사진을 교체하면 옛 파일은 지워지고 경로가 바뀐다', async () => {
      const room = await service.create({ ...base });
      const first = await service.setImage(room.id, PNG);
      const second = await service.setImage(room.id, JPG);

      expect(second.imageKey).not.toBe(first.imageKey);
      expect(images.files.has(first.imageKey!)).toBe(false);
      expect(images.files.size).toBe(1);
    });

    it('이미지가 아닌 파일은 거부한다 (확장자가 아니라 내용으로 판별)', async () => {
      const room = await service.create({ ...base });
      await expect(
        service.setImage(room.id, Buffer.from('<script>alert(1)</script>')),
      ).rejects.toMatchObject({ code: 'IMAGE_INVALID' });
      expect(images.files.size).toBe(0);
    });

    it('삭제된 자습실에는 사진을 올릴 수 없고, 저장소에 파일도 남지 않는다', async () => {
      const room = await service.create({ ...base });
      await service.remove(room.id);
      await expect(service.setImage(room.id, PNG)).rejects.toMatchObject({
        code: 'ROOM_DELETED',
      });
      expect(images.files.size).toBe(0);
    });

    it('저장소가 실패하면 오류를 내고 DB 는 바뀌지 않는다', async () => {
      const room = await service.create({ ...base });
      images.failPut = true;
      await expect(service.setImage(room.id, PNG)).rejects.toThrow();
      expect((await service.findOne(room.id)).imageKey).toBeNull();
    });

    it('사진을 지우면 파일과 경로가 함께 사라지고, 사진이 없으면 조회는 IMAGE_NOT_FOUND', async () => {
      const room = await service.create({ ...base });
      await expect(service.getImage(room.id)).rejects.toMatchObject({
        code: 'IMAGE_NOT_FOUND',
      });

      await service.setImage(room.id, PNG);
      const removed = await service.removeImage(room.id);
      expect(removed.imageKey).toBeNull();
      expect(images.files.size).toBe(0);
      // 사진이 없는 상태에서 또 지워도 오류가 아니다
      await expect(service.removeImage(room.id)).resolves.toBeDefined();
    });
  });

  describe('관', () => {
    it('처음 실행하면 예시 자습실이 본관·별관·동관에 하나씩 들어간다', async () => {
      await service.onModuleInit();
      const list = await service.findAll();
      expect(list.map((r) => r.hall).sort()).toEqual(['ANNEX', 'EAST', 'MAIN']);
    });

    it('관이 정해지기 전에 만든 자습실은 시작할 때 본관으로 채워진다', async () => {
      const room = await service.create({ ...base });
      await db.transaction(async () => {
        const old = {
          ...(await rooms.findById(room.id))!,
        } as Partial<StudyRoom>;
        delete old.hall;
        await rooms.update(old as StudyRoom);
      });
      await service.onModuleInit();
      expect((await service.findOne(room.id)).hall).toBe('MAIN');
    });

    it('등록할 때 정한 관이 저장되고, 신청이 없으면 관을 옮길 수 있다', async () => {
      const room = await service.create({ ...base, hall: 'WEST' });
      expect(room.hall).toBe('WEST');
      const moved = await service.update(room.id, { hall: 'ANNEX' });
      expect(moved.hall).toBe('ANNEX');
      // 관만 바꾸고 나머지는 그대로 유지한다
      expect(moved).toMatchObject({
        name: base.name,
        maxPersonnel: base.maxPersonnel,
      });
    });

    it('신청이 남아 있는 자습실은 관을 옮길 수 없지만, 같은 관으로 보내거나 다른 정보 수정은 된다', async () => {
      const room = await service.create({ ...base, hall: 'MAIN' });
      await addVisit(room.id, 1);

      await expect(
        service.update(room.id, { hall: 'ANNEX' }),
      ).rejects.toMatchObject({
        code: 'HALL_CHANGE_HAS_VISITS',
        data: { currentCount: 1 },
      });
      await expect(
        service.update(room.id, { hall: 'MAIN', name: '새 이름' }),
      ).resolves.toMatchObject({ hall: 'MAIN', name: '새 이름' });
      expect((await service.findOne(room.id)).hall).toBe('MAIN');
    });
  });
});
