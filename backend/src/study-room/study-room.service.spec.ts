import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { VISIT_COLLECTION, VisitReservation } from '../visit/visit.entity';
import { STUDY_ROOM_COLLECTION, StudyRoom } from './study-room.entity';
import { StudyRoomService } from './study-room.service';

const NOW = '2026-11-13T00:00:00.000Z';
const base = {
  name: '1자습실',
  maxPersonnel: 3,
  startDate: '2026-11-20T00:00:00.000Z',
  endDate: '2026-11-30T00:00:00.000Z',
};

describe('StudyRoomService', () => {
  let dir: string;
  let db: JsonDatabase;
  let visits: JsonRepository<VisitReservation>;
  let service: StudyRoomService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'room-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    const rooms = new JsonRepository<StudyRoom>(db, STUDY_ROOM_COLLECTION);
    visits = new JsonRepository<VisitReservation>(db, VISIT_COLLECTION);
    // 시각을 고정한 Clock (서비스가 new Date()를 직접 쓰지 않는 이점)
    const clock = { now: () => new Date(NOW) } as Clock;
    service = new StudyRoomService(rooms, visits, db, clock);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const addVisit = (
    roomId: number,
    studentId: number,
    visitAt = '2026-11-25T00:00:00.000Z',
    status: VisitReservation['status'] = 'ACTIVE',
  ) =>
    db.transaction(() =>
      visits.create({
        roomId,
        studentId,
        visitAt,
        status,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );

  it('시작이 종료보다 늦거나 같으면 등록할 수 없다', async () => {
    await expect(
      service.create({ ...base, startDate: base.endDate }),
    ).rejects.toMatchObject({ code: 'INVALID_PERIOD' });
  });

  it('등록하면 날짜가 UTC ISO로 통일되어 저장된다', async () => {
    const room = await service.create({
      ...base,
      startDate: '2026-11-20T09:00:00+09:00',
    });
    expect(room.startDate).toBe('2026-11-20T00:00:00.000Z');
    expect(room.createdAt).toBe(NOW);
  });

  it('목록은 삭제된 자습실을 빼고, 취소된 신청은 인원에서 제외한다', async () => {
    const a = await service.create(base);
    const b = await service.create(base);
    await addVisit(a.id, 1);
    await addVisit(a.id, 2);
    await addVisit(a.id, 3, undefined, 'CANCELLED');
    await service.remove(b.id);

    const list = await service.findAll();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.id, currentPersonnel: 2 });
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
      data: { currentPersonnel: 2 },
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
});
