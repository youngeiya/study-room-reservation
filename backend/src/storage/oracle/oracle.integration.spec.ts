import { InMemoryImageStorage } from '../../image/in-memory-image-storage';
import oracledb from 'oracledb';
import { Clock } from '../../common/clock.service';
import { StudentService } from '../../student/student.service';
import { STUDENT_COLLECTION, Student } from '../../student/student.entity';
import {
  STUDY_ROOM_COLLECTION,
  StudyRoom,
} from '../../study-room/study-room.entity';
import { StudyRoomService } from '../../study-room/study-room.service';
import {
  VISIT_COLLECTION,
  VISIT_HISTORY_COLLECTION,
  VisitHistory,
  VisitReservation,
} from '../../visit/visit.entity';
import { VisitService } from '../../visit/visit.service';
import { OracleDatabase } from './oracle-database';

/**
 * Oracle 통합 테스트. 실제 Oracle 에 접속해서 쓰기·동시성·제약을 검증한다.
 *
 * ⚠ 이 테스트는 시작할 때 대상 스키마의 **모든 데이터를 지운다.**
 *    반드시 테스트 전용 스키마(db/oracle/02_schema.sql 만 적용한 빈 스키마)로만 실행할 것.
 *
 * 환경 변수가 모두 있을 때만 실행되고, 없으면 건너뛴다 (평소 `npm test` 에는 영향 없음).
 *   ORACLE_TEST_USER / ORACLE_TEST_PASSWORD / ORACLE_TEST_CONNECT_STRING
 *   예) ORACLE_TEST_USER=studyroom_test ORACLE_TEST_PASSWORD=... ORACLE_TEST_CONNECT_STRING=host:1521/FREEPDB1 npm test -- oracle.integration
 */
const user = process.env.ORACLE_TEST_USER;
const password = process.env.ORACLE_TEST_PASSWORD;
const connectString = process.env.ORACLE_TEST_CONNECT_STRING;
const enabled = !!(user && password && connectString);

const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * day).toISOString();
// "오늘 + offsetDays 일(한국 시간)"의 kstHour 시 정각. 같은 한국 날짜인지가 중요한 테스트에서 쓴다.
const KST_MS = 9 * 60 * 60 * 1000;
const kstAt = (offsetDays: number, kstHour: number) => {
  const kstMidnight = Math.floor((Date.now() + KST_MS) / day) * day;
  return new Date(
    kstMidnight + offsetDays * day + kstHour * 60 * 60 * 1000 - KST_MS,
  ).toISOString();
};

(enabled ? describe : describe.skip)('Oracle 통합 테스트', () => {
  let db: OracleDatabase;
  let students: StudentService;
  let rooms: StudyRoomService;
  let visits: VisitService;
  let studentRepo: ReturnType<OracleDatabase['repository']>;
  let seq = 0;

  const wipe = async () => {
    const conn = await oracledb.getConnection({
      user,
      password,
      connectString,
    });
    try {
      for (const t of [
        'visit_history',
        'visit_reservation',
        'student',
        'study_room',
      ]) {
        await conn.execute(`DELETE FROM ${t}`);
      }
      await conn.commit();
    } finally {
      await conn.close();
    }
  };

  beforeAll(async () => {
    db = await OracleDatabase.connect({
      user: user!,
      password: password!,
      connectString: connectString!,
    });
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  beforeEach(async () => {
    await wipe();
    seq = 0;
    const clock = new Clock();
    const studentRepository = db.repository<Student>(STUDENT_COLLECTION);
    studentRepo = studentRepository;
    const roomRepository = db.repository<StudyRoom>(STUDY_ROOM_COLLECTION);
    const visitRepository = db.repository<VisitReservation>(VISIT_COLLECTION);
    const historyRepository = db.repository<VisitHistory>(
      VISIT_HISTORY_COLLECTION,
    );
    students = new StudentService(
      studentRepository,
      visitRepository,
      db,
      clock,
    );
    rooms = new StudyRoomService(
      roomRepository,
      visitRepository,
      db,
      clock,
      new InMemoryImageStorage(),
    );
    visits = new VisitService(
      visitRepository,
      historyRepository,
      roomRepository,
      studentRepository,
      db,
      clock,
    );
  });

  const newStudent = (studentNo?: string) =>
    students.create({
      name: `학생${++seq}`,
      phone: '010-1234-5678',
      studentNo: studentNo ?? `S2026${seq}`,
    });
  const newRoom = (maxPersonnel = 3) =>
    rooms.create({
      name: '테스트 자습실',
      branch: 'H' as const,
      maxPersonnel,
      startDate: iso(-1),
      endDate: iso(30),
    });
  const activeCount = async (roomId: number) =>
    (await visits.findHistories(roomId)).length;
  const countMatches = async (roomId: number) => {
    const room = await rooms.findOne(roomId);
    const all = await Promise.all(
      (await students.findAll()).map((s) => visits.findByStudent(s.id)),
    );
    const active = all
      .flat()
      .filter((v) => v.roomId === roomId && v.status === 'ACTIVE');
    expect(room.currentCount).toBe(active.length);
  };

  it('등록한 값이 시각(UTC ISO)·한글·null 포함 그대로 돌아온다', async () => {
    const start = '2026-12-01T00:00:00.000Z';
    const end = '2026-12-31T12:34:56.789Z';
    const room = await rooms.create({
      name: '한글 이름 자습실',
      branch: 'H' as const,
      maxPersonnel: 4,
      startDate: start,
      endDate: end,
    });
    const found = await rooms.findOne(room.id);
    expect(found).toMatchObject({
      name: '한글 이름 자습실',
      branch: 'H' as const,
      maxPersonnel: 4,
      currentCount: 0,
      startDate: start,
      endDate: end,
      deletedAt: null,
      version: 0,
    });

    const s = await students.create({
      name: '홍길동',
      phone: '010-1234-5678',
      studentNo: 'A-100',
    });
    expect(await studentRepo.findById(s.id)).toMatchObject({
      name: '홍길동',
      studentNo: 'A-100',
      guardianPhone: null,
      zipCode: null,
      address: null,
      addressDetail: null,
      grade: null,
      memo: null,
      status: 'ENROLLED',
    });
  });

  it('수정하면 version 이 올라가고, 낡은 version 으로 수정하면 충돌한다', async () => {
    const room = await newRoom();
    const updated = await rooms.update(room.id, { maxPersonnel: 5 });
    expect(updated.version).toBe(1);

    // 낡은 version(0)으로 직접 update → 낙관적 락 충돌
    const roomRepo = db.repository<StudyRoom>(STUDY_ROOM_COLLECTION);
    await expect(
      db.transaction(() => roomRepo.update({ ...room, name: '낡은 값' }), {
        retries: 0,
      }),
    ).rejects.toMatchObject({ name: 'Error', message: expect.any(String) });
    expect((await rooms.findOne(room.id)).name).toBe('테스트 자습실');
  });

  it('학번 중복은 거부되고, 동시에 같은 학번으로 등록하면 한 명만 성공한다', async () => {
    await newStudent('A-100');
    await expect(newStudent('A-100')).rejects.toMatchObject({
      code: 'STUDENT_NO_DUPLICATED',
    });

    const results = await Promise.allSettled(
      ['B-200', 'B-200', 'B-200'].map((no) => newStudent(no)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toMatchObject({ code: 'STUDENT_NO_DUPLICATED' });
      }
    }
  });

  it('신청·중복·정원·취소·재신청이 규칙대로 동작하고 이력이 쌓인다', async () => {
    const [a, b, c] = [
      await newStudent(),
      await newStudent(),
      await newStudent(),
    ];
    const room = await newRoom(2);
    const room2 = await newRoom(2);
    const at = iso(2);

    const visit = await visits.create(room.id, {
      studentId: a.id,
      visitAt: at,
    });
    expect(visit).toMatchObject({ status: 'ACTIVE', roomId: room.id });
    expect((await rooms.findOne(room.id)).currentCount).toBe(1);

    await expect(
      visits.create(room.id, { studentId: a.id, visitAt: at }),
    ).rejects.toMatchObject({ code: 'ALREADY_APPLIED' });
    await expect(
      visits.create(room2.id, { studentId: a.id, visitAt: at }),
    ).rejects.toMatchObject({ code: 'ALREADY_APPLIED_OTHER_ROOM' });

    await visits.create(room.id, { studentId: b.id, visitAt: at });
    await expect(
      visits.create(room.id, { studentId: c.id, visitAt: at }),
    ).rejects.toMatchObject({ code: 'ROOM_FULL' });
    expect((await rooms.findOne(room.id)).currentCount).toBe(2);

    // 시간 수정 → 이력 UPDATE
    const moved = iso(2.5);
    await visits.update(visit.id, { studentId: a.id, visitAt: moved });
    // 취소 → 인원 -1, 같은 자리에 c 가 신청 가능
    await visits.cancel(visit.id, { studentId: a.id });
    expect((await rooms.findOne(room.id)).currentCount).toBe(1);
    await visits.create(room.id, { studentId: c.id, visitAt: at });
    // 취소했던 a 의 재신청: 정원이 차서 거부 → c 가 취소한 뒤 가능
    await expect(
      visits.create(room.id, { studentId: a.id, visitAt: at }),
    ).rejects.toMatchObject({ code: 'ROOM_FULL' });

    const logs = await visits.findHistories(room.id);
    expect(
      logs.filter((l) => l.studentId === a.id).map((l) => l.action),
    ).toEqual(['CREATE', 'UPDATE', 'CANCEL']);
    expect(logs[0].studentName).toBe(a.name);
    await countMatches(room.id);
  });

  it('정원 3 자습실에 5명이 동시에 신청하면 정확히 3명만 성공한다', async () => {
    const people = await Promise.all(
      Array.from({ length: 5 }, async () => newStudent()),
    );
    const room = await newRoom(3);
    const at = iso(2);

    const results = await Promise.allSettled(
      people.map((p) =>
        visits.create(room.id, { studentId: p.id, visitAt: at }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        code: 'ROOM_FULL',
      });
    }
    expect((await rooms.findOne(room.id)).currentCount).toBe(3);
    await countMatches(room.id);
  });

  it('같은 학생이 같은 날(한국 시간) 서로 다른 자습실에 동시에 신청하면 한 건만 성공한다', async () => {
    const s = await newStudent();
    const r1 = await newRoom();
    const r2 = await newRoom();

    const results = await Promise.allSettled([
      visits.create(r1.id, { studentId: s.id, visitAt: kstAt(1, 10) }),
      visits.create(r2.id, { studentId: s.id, visitAt: kstAt(1, 14) }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await countMatches(r1.id);
    await countMatches(r2.id);
  });

  it('날짜가 다르면 같은 자습실·다른 자습실에도 신청할 수 있고, 다른 신청이 있는 날로는 수정할 수 없다', async () => {
    const s = await newStudent();
    const r1 = await newRoom();
    const r2 = await newRoom();

    const first = await visits.create(r1.id, {
      studentId: s.id,
      visitAt: kstAt(1, 10),
    });
    await expect(
      visits.create(r1.id, { studentId: s.id, visitAt: kstAt(2, 10) }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
    const third = await visits.create(r2.id, {
      studentId: s.id,
      visitAt: kstAt(3, 0), // 오늘 + 3일 한국 자정 (예약 가능 기간 안, 앞의 두 신청과 다른 날)
    });
    expect(third.status).toBe('ACTIVE');

    // 이미 신청이 있는 날(내일 +1)로 옮기려는 수정은 거부
    await expect(
      visits.update(first.id, { studentId: s.id, visitAt: kstAt(2, 11) }),
    ).rejects.toMatchObject({ code: 'ALREADY_APPLIED' });

    await countMatches(r1.id);
    await countMatches(r2.id);
  });

  it('활성 신청이 있는 학생은 삭제·퇴원할 수 없고, 취소하면 가능하다. 삭제된 학생의 이름은 이력에 남는다', async () => {
    const s = await newStudent();
    const room = await newRoom();
    const visit = await visits.create(room.id, {
      studentId: s.id,
      visitAt: iso(2),
    });

    await expect(students.remove(s.id)).rejects.toMatchObject({
      code: 'STUDENT_HAS_ACTIVE_VISITS',
    });
    await expect(
      students.update(s.id, { status: 'WITHDRAWN' }),
    ).rejects.toMatchObject({ code: 'STUDENT_HAS_ACTIVE_VISITS' });

    await visits.cancel(visit.id, { studentId: s.id });
    await students.remove(s.id);

    const logs = await visits.findHistories(room.id);
    expect(logs.map((l) => l.studentName)).toEqual([s.name, s.name]);
    expect(await students.findAll()).toHaveLength(0);
    expect(await activeCount(room.id)).toBe(2);
  });

  it('인원을 현재 신청 수보다 줄이는 수정과, 도중 예외가 난 트랜잭션은 반영되지 않는다', async () => {
    const s = await newStudent();
    const room = await newRoom(3);
    await visits.create(room.id, { studentId: s.id, visitAt: iso(2) });

    await expect(
      rooms.update(room.id, { maxPersonnel: 0 }),
    ).rejects.toBeDefined();
    expect((await rooms.findOne(room.id)).maxPersonnel).toBe(3);

    // 같은 트랜잭션에서 쓴 뒤 예외 → 롤백
    const repo = db.repository<StudyRoom>(STUDY_ROOM_COLLECTION);
    await expect(
      db.transaction(async () => {
        const r = (await repo.findById(room.id))!;
        await repo.update({ ...r, name: '롤백되어야 함' });
        throw new Error('중간 실패');
      }),
    ).rejects.toThrow('중간 실패');
    expect((await rooms.findOne(room.id)).name).toBe('테스트 자습실');
  });
});
