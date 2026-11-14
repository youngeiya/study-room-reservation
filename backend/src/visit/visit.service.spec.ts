import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { STUDENT_COLLECTION, Student } from '../student/student.entity';
import {
  STUDY_ROOM_COLLECTION,
  StudyRoom,
} from '../study-room/study-room.entity';
import { StudyRoomService } from '../study-room/study-room.service';
import {
  VISIT_COLLECTION,
  VISIT_HISTORY_COLLECTION,
  VisitHistory,
  VisitReservation,
} from './visit.entity';
import { VisitService } from './visit.service';

const START = '2026-11-20T00:00:00.000Z';
const END = '2026-11-30T00:00:00.000Z';
const DAY25 = '2026-11-25T09:00:00.000Z';
const DAY26 = '2026-11-26T09:00:00.000Z';

describe('VisitService', () => {
  let dir: string;
  let db: JsonDatabase;
  let students: JsonRepository<Student>;
  let rooms: JsonRepository<StudyRoom>;
  let visits: JsonRepository<VisitReservation>;
  let histories: JsonRepository<VisitHistory>;
  let roomService: StudyRoomService;
  let service: VisitService;
  let now: Date;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'visit-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    students = new JsonRepository<Student>(db, STUDENT_COLLECTION);
    rooms = new JsonRepository<StudyRoom>(db, STUDY_ROOM_COLLECTION);
    visits = new JsonRepository<VisitReservation>(db, VISIT_COLLECTION);
    histories = new JsonRepository<VisitHistory>(db, VISIT_HISTORY_COLLECTION);
    now = new Date('2026-11-13T00:00:00.000Z');
    const clock = { now: () => now } as Clock; // 테스트에서 시각을 직접 움직인다
    roomService = new StudyRoomService(rooms, visits, db, clock);
    service = new VisitService(visits, histories, rooms, students, db, clock);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  // ── 준비 도우미 ──────────────────────────────────────────────
  const seedStudents = (count: number) =>
    db.transaction(async () => {
      const ids: number[] = [];
      for (let i = 1; i <= count; i++) {
        const s = await students.create({
          name: `학생${i}`,
          phone: `010-0000-000${i}`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          deletedAt: null,
        });
        ids.push(s.id);
      }
      return ids;
    });

  const makeRoom = (maxPersonnel = 2) =>
    roomService.create({
      name: '1자습실',
      maxPersonnel,
      startDate: START,
      endDate: END,
    });

  /** 핵심 불변식: 저장된 currentCount 는 항상 실제 ACTIVE 신청 수와 같아야 한다. */
  const expectCountMatches = async (roomId: number) => {
    const room = (await rooms.findById(roomId))!;
    const active = await visits.findAll(
      (v) => v.roomId === roomId && v.status === 'ACTIVE',
    );
    expect(room.currentCount).toBe(active.length);
  };

  // ── 신청 ────────────────────────────────────────────────────
  it('신청하면 ACTIVE 신청과 CREATE 이력이 생기고 인원이 1 늘어난다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();

    const visit = await service.create(room.id, {
      studentId: s1,
      visitAt: DAY25,
    });

    expect(visit).toMatchObject({
      roomId: room.id,
      studentId: s1,
      status: 'ACTIVE',
    });
    expect((await rooms.findById(room.id))!.currentCount).toBe(1);
    const logs = await histories.findAll();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'CREATE',
      beforeVisitAt: null,
      afterVisitAt: DAY25,
    });
    await expectCountMatches(room.id);
  });

  it('정원이 차면 ROOM_FULL 이고, 거부된 신청은 아무것도 남기지 않는다', async () => {
    const [s1, s2, s3] = await seedStudents(3);
    const room = await makeRoom(2);
    await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await service.create(room.id, { studentId: s2, visitAt: DAY25 });

    await expect(
      service.create(room.id, { studentId: s3, visitAt: DAY25 }),
    ).rejects.toMatchObject({ code: 'ROOM_FULL' });

    expect(await visits.findAll()).toHaveLength(2);
    expect(await histories.findAll()).toHaveLength(2);
    await expectCountMatches(room.id);
  });

  it('같은 학생이 같은 자습실에 다시 신청하면 ALREADY_APPLIED', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await expect(
      service.create(room.id, { studentId: s1, visitAt: DAY26 }),
    ).rejects.toMatchObject({ code: 'ALREADY_APPLIED' });
    await expectCountMatches(room.id);
  });

  it('운영 기간 밖이면 OUT_OF_PERIOD (시작·종료 시각 자체는 허용)', async () => {
    const [s1, s2, s3] = await seedStudents(3);
    const room = await makeRoom(3);

    await expect(
      service.create(room.id, {
        studentId: s1,
        visitAt: '2026-11-19T23:59:59.999Z',
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_PERIOD' });
    await expect(
      service.create(room.id, {
        studentId: s1,
        visitAt: '2026-11-30T00:00:00.001Z',
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_PERIOD' });
    await expect(
      service.create(room.id, { studentId: s2, visitAt: START }),
    ).resolves.toBeDefined();
    await expect(
      service.create(room.id, { studentId: s3, visitAt: END }),
    ).resolves.toBeDefined();
  });

  it('삭제된 자습실, 없는 자습실, 삭제된 학생에는 신청할 수 없다', async () => {
    const [s1, s2] = await seedStudents(2);
    const room = await makeRoom();
    await roomService.remove(room.id);
    await expect(
      service.create(room.id, { studentId: s1, visitAt: DAY25 }),
    ).rejects.toMatchObject({ code: 'ROOM_DELETED' });
    await expect(
      service.create(999, { studentId: s1, visitAt: DAY25 }),
    ).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });

    const alive = await makeRoom();
    await db.transaction(async () => {
      const s = (await students.findById(s2))!;
      await students.update({ ...s, deletedAt: now.toISOString() });
    });
    await expect(
      service.create(alive.id, { studentId: s2, visitAt: DAY25 }),
    ).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
  });

  // ── 취소 ────────────────────────────────────────────────────
  it('취소하면 인원이 1 줄어 정원이 복원되고, 다른 학생이 그 자리에 신청할 수 있다', async () => {
    const [s1, s2, s3] = await seedStudents(3);
    const room = await makeRoom(2);
    const v1 = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await service.create(room.id, { studentId: s2, visitAt: DAY25 });
    await expect(
      service.create(room.id, { studentId: s3, visitAt: DAY25 }),
    ).rejects.toMatchObject({ code: 'ROOM_FULL' });

    const cancelled = await service.cancel(v1.id, { studentId: s1 });
    expect(cancelled.status).toBe('CANCELLED');
    expect((await rooms.findById(room.id))!.currentCount).toBe(1);
    await expectCountMatches(room.id);

    await expect(
      service.create(room.id, { studentId: s3, visitAt: DAY25 }),
    ).resolves.toBeDefined();
    await expectCountMatches(room.id);

    const cancelLog = (await histories.findAll()).find(
      (h) => h.action === 'CANCEL',
    )!;
    expect(cancelLog).toMatchObject({
      beforeVisitAt: DAY25,
      afterVisitAt: null,
    });
  });

  it('이미 취소한 신청을 또 취소하면 VISIT_ALREADY_CANCELLED (인원이 두 번 줄지 않는다)', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await service.cancel(v.id, { studentId: s1 });
    await expect(service.cancel(v.id, { studentId: s1 })).rejects.toMatchObject(
      { code: 'VISIT_ALREADY_CANCELLED' },
    );
    expect((await rooms.findById(room.id))!.currentCount).toBe(0);
  });

  it('취소 후 재신청하면 같은 신청 행이 다시 ACTIVE 가 되고 인원이 복구된다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const first = await service.create(room.id, {
      studentId: s1,
      visitAt: DAY25,
    });
    await service.cancel(first.id, { studentId: s1 });

    const again = await service.create(room.id, {
      studentId: s1,
      visitAt: DAY26,
    });

    expect(again.id).toBe(first.id); // 새 행이 아니라 기존 행 재사용
    expect(again).toMatchObject({ status: 'ACTIVE', visitAt: DAY26 });
    expect(await visits.findAll()).toHaveLength(1);
    expect((await histories.findAll()).map((h) => h.action)).toEqual([
      'CREATE',
      'CANCEL',
      'CREATE',
    ]);
    await expectCountMatches(room.id);
  });

  it('삭제된 자습실의 신청도 취소는 할 수 있다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await roomService.remove(room.id);
    await expect(
      service.cancel(v.id, { studentId: s1 }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    await expectCountMatches(room.id);
  });

  // ── 시간 수정 ────────────────────────────────────────────────
  it('방문 시간을 수정하면 UPDATE 이력(전·후 시각)이 남고 인원은 그대로다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });

    const updated = await service.update(v.id, {
      studentId: s1,
      visitAt: DAY26,
    });

    expect(updated.visitAt).toBe(DAY26);
    const log = (await histories.findAll()).find((h) => h.action === 'UPDATE')!;
    expect(log).toMatchObject({ beforeVisitAt: DAY25, afterVisitAt: DAY26 });
    await expectCountMatches(room.id);
  });

  it('같은 시간으로 수정하면 이력을 남기지 않는다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await service.update(v.id, { studentId: s1, visitAt: DAY25 });
    expect(await histories.findAll()).toHaveLength(1); // CREATE 만
  });

  it('수정 시에도 운영 기간·취소 상태를 검사한다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await expect(
      service.update(v.id, {
        studentId: s1,
        visitAt: '2026-12-25T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_PERIOD' });

    await service.cancel(v.id, { studentId: s1 });
    await expect(
      service.update(v.id, { studentId: s1, visitAt: DAY26 }),
    ).rejects.toMatchObject({ code: 'VISIT_ALREADY_CANCELLED' });
  });

  it('다른 학생의 신청은 수정·취소할 수 없고, 없는 신청은 VISIT_NOT_FOUND', async () => {
    const [s1, s2] = await seedStudents(2);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await expect(
      service.update(v.id, { studentId: s2, visitAt: DAY26 }),
    ).rejects.toMatchObject({ code: 'NOT_VISIT_OWNER' });
    await expect(service.cancel(v.id, { studentId: s2 })).rejects.toMatchObject(
      { code: 'NOT_VISIT_OWNER' },
    );
    await expect(service.cancel(999, { studentId: s1 })).rejects.toMatchObject({
      code: 'VISIT_NOT_FOUND',
    });
    await expectCountMatches(room.id);
  });

  // ── 조회 ────────────────────────────────────────────────────
  it('이력은 시간순으로 학생 이름과 함께 조회되고, 삭제된 자습실도 조회된다', async () => {
    const [s1, s2] = await seedStudents(2);
    const room = await makeRoom();
    const v1 = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    now = new Date('2026-11-13T01:00:00.000Z');
    await service.create(room.id, { studentId: s2, visitAt: DAY25 });
    now = new Date('2026-11-13T02:00:00.000Z');
    await service.cancel(v1.id, { studentId: s1 });
    await roomService.remove(room.id);

    const list = await service.findHistories(room.id);
    expect(list.map((h) => [h.studentName, h.action])).toEqual([
      ['학생1', 'CREATE'],
      ['학생2', 'CREATE'],
      ['학생1', 'CANCEL'],
    ]);
    await expect(service.findHistories(999)).rejects.toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('학생의 신청 목록에는 취소된 신청도 상태와 함께 나온다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom();
    const v = await service.create(room.id, { studentId: s1, visitAt: DAY25 });
    await service.cancel(v.id, { studentId: s1 });
    const list = await service.findByStudent(s1);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'CANCELLED', roomName: '1자습실' });
  });

  // ── 동시성 ──────────────────────────────────────────────────
  it('정원 3인 자습실에 8명이 동시에 신청해도 정확히 3명만 성공하고 인원이 어긋나지 않는다', async () => {
    const ids = await seedStudents(8);
    const room = await makeRoom(3);

    const results = await Promise.allSettled(
      ids.map((studentId) =>
        service.create(room.id, { studentId, visitAt: DAY25 }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];
    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(5);
    expect(rejected.every((r) => r.reason.code === 'ROOM_FULL')).toBe(true);
    expect((await rooms.findById(room.id))!.currentCount).toBe(3);
    await expectCountMatches(room.id);
    expect(await histories.findAll()).toHaveLength(3); // 거부된 신청은 이력도 남기지 않음
  });

  it('같은 학생이 동시에 두 번 신청(더블 클릭)해도 한 건만 생긴다', async () => {
    const [s1] = await seedStudents(1);
    const room = await makeRoom(3);

    const results = await Promise.allSettled([
      service.create(room.id, { studentId: s1, visitAt: DAY25 }),
      service.create(room.id, { studentId: s1, visitAt: DAY25 }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failure.reason.code).toBe('ALREADY_APPLIED');
    expect(await visits.findAll()).toHaveLength(1);
    await expectCountMatches(room.id);
  });

  it('신청과 취소가 섞여 동시에 들어와도 인원이 실제 신청 수와 같다', async () => {
    const ids = await seedStudents(6);
    const room = await makeRoom(6);
    const first = await Promise.all(
      ids
        .slice(0, 3)
        .map((studentId) =>
          service.create(room.id, { studentId, visitAt: DAY25 }),
        ),
    );

    await Promise.all([
      ...first.map((v) => service.cancel(v.id, { studentId: v.studentId })),
      ...ids
        .slice(3)
        .map((studentId) =>
          service.create(room.id, { studentId, visitAt: DAY25 }),
        ),
    ]);

    expect((await rooms.findById(room.id))!.currentCount).toBe(3);
    await expectCountMatches(room.id);
  });
});
