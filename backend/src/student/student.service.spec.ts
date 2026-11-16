import { InMemoryImageStorage } from '../image/in-memory-image-storage';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
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
} from '../visit/visit.entity';
import { VisitService } from '../visit/visit.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { STUDENT_COLLECTION, Student } from './student.entity';
import { StudentService } from './student.service';

const NOW = '2026-11-24T00:00:00.000Z';
const DAY25 = '2026-11-25T09:00:00.000Z';

describe('StudentService', () => {
  let dir: string;
  let db: JsonDatabase;
  let repo: JsonRepository<Student>;
  let visits: JsonRepository<VisitReservation>;
  let service: StudentService;
  let visitService: VisitService;
  let roomService: StudyRoomService;
  let seq: number;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'student-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    repo = new JsonRepository<Student>(db, STUDENT_COLLECTION);
    visits = new JsonRepository<VisitReservation>(db, VISIT_COLLECTION);
    const rooms = new JsonRepository<StudyRoom>(db, STUDY_ROOM_COLLECTION);
    const histories = new JsonRepository<VisitHistory>(
      db,
      VISIT_HISTORY_COLLECTION,
    );
    const clock = { now: () => new Date(NOW) } as Clock;
    service = new StudentService(repo, visits, db, clock);
    roomService = new StudyRoomService(
      rooms,
      visits,
      db,
      clock,
      new InMemoryImageStorage(),
    );
    visitService = new VisitService(visits, histories, rooms, repo, db, clock);
    seq = 0;
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  // 학번이 겹치지 않는 학생 등록 요청을 만든다
  const dto = (extra: Partial<CreateStudentDto> = {}): CreateStudentDto => ({
    name: '홍길동',
    phone: '010-1234-5678',
    studentNo: `S2026${++seq}`,
    ...extra,
  });
  const makeRoom = () =>
    roomService.create({
      name: '1자습실',
      maxPersonnel: 3,
      startDate: '2026-11-20T00:00:00.000Z',
      endDate: '2026-11-30T00:00:00.000Z',
    });

  describe('시드와 이전 데이터 보정', () => {
    it('학생이 없으면 시드 학생을 넣고, 두 번 실행해도 중복되지 않는다', async () => {
      await service.onModuleInit();
      await service.onModuleInit();
      const list = await service.findAll();
      expect(list).toHaveLength(5);
      expect(list.every((s) => s.status === 'ENROLLED' && s.studentNo)).toBe(
        true,
      );
    });

    it('새 필드가 없는 이전 데이터는 기본값(재원, 값 없음)으로 채워진다', async () => {
      // 이전 버전에서 저장된 학생: 학번·상태 등이 없다 (두 명 모두 학번 null 이어도 유니크 위반이 아니다)
      await db.transaction(async () => {
        for (const name of ['옛학생1', '옛학생2']) {
          await repo.create({
            name,
            phone: '010-0000-0000',
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
          } as unknown as Omit<Student, 'id' | 'version'>);
        }
      });

      await service.onModuleInit();

      const list = await service.findAll();
      expect(list).toHaveLength(2); // 시드가 추가되지 않는다
      expect(list[0]).toMatchObject({
        status: 'ENROLLED',
        studentNo: null,
        guardianPhone: null,
        grade: null,
        memo: null,
      });
    });

    it('삭제된 학생은 목록에서 제외한다', async () => {
      await service.onModuleInit();
      const [first] = await service.findAll();
      await service.remove(first.id);
      const list = await service.findAll();
      expect(list).toHaveLength(4);
      expect(list.find((s) => s.id === first.id)).toBeUndefined();
    });
  });

  describe('등록', () => {
    it('입력값은 공백을 정리해 저장하고 재원 상태로 시작하며, 선택 값은 비어 있으면 null 이다', async () => {
      const student = await service.create(
        dto({
          name: '  홍길동 ',
          studentNo: ' A-100 ',
          grade: ' 고2 ',
          guardianPhone: '',
        }),
      );
      expect(student).toMatchObject({
        name: '홍길동',
        studentNo: 'A-100',
        grade: '고2',
        guardianPhone: null,
        memo: null,
        status: 'ENROLLED',
        createdAt: NOW,
        deletedAt: null,
      });
    });

    it('이미 쓰는 학번으로는 등록할 수 없다', async () => {
      await service.create(dto({ studentNo: 'A-100' }));
      await expect(
        service.create(dto({ studentNo: 'A-100' })),
      ).rejects.toMatchObject({ code: 'STUDENT_NO_DUPLICATED' });
      expect(await service.findAll()).toHaveLength(1);
    });

    it('삭제된 학생의 학번은 다시 쓸 수 있다', async () => {
      const old = await service.create(dto({ studentNo: 'A-100' }));
      await service.remove(old.id);
      await expect(
        service.create(dto({ studentNo: 'A-100' })),
      ).resolves.toMatchObject({ studentNo: 'A-100' });
    });

    it('동시에 같은 학번으로 등록하면 한 명만 등록된다 (서비스 검사를 둘 다 통과해도 저장소 제약이 막는다)', async () => {
      const results = await Promise.allSettled([
        service.create(dto({ studentNo: 'A-100', name: '가' })),
        service.create(dto({ studentNo: 'A-100', name: '나' })),
        service.create(dto({ studentNo: 'A-100', name: '다' })),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toMatchObject({ code: 'STUDENT_NO_DUPLICATED' });
        }
      }
      expect(await service.findAll()).toHaveLength(1);
    });
  });

  describe('수정', () => {
    it('보낸 필드만 바꾸고 나머지는 유지한다', async () => {
      const s = await service.create(dto({ grade: '고2' }));
      const updated = await service.update(s.id, { phone: '010-9999-8888' });
      expect(updated).toMatchObject({
        name: '홍길동',
        phone: '010-9999-8888',
        grade: '고2',
        studentNo: s.studentNo,
      });
      expect(updated.version).toBeGreaterThan(s.version);
    });

    it('선택 값은 null 을 보내면 비워진다', async () => {
      const s = await service.create(
        dto({ guardianPhone: '010-2222-3333', memo: '메모' }),
      );
      const updated = await service.update(s.id, {
        guardianPhone: null,
        memo: null,
      });
      expect(updated).toMatchObject({ guardianPhone: null, memo: null });
    });

    it('주소(우편번호·도로명주소·상세주소)를 저장하고, 보내지 않으면 유지하며, null 이면 비운다', async () => {
      const s = await service.create(
        dto({
          zipCode: '06236',
          address: ' 서울특별시 강남구 테헤란로 152 ',
          addressDetail: '5층',
        }),
      );
      expect(s).toMatchObject({
        zipCode: '06236',
        address: '서울특별시 강남구 테헤란로 152',
        addressDetail: '5층',
      });

      const kept = await service.update(s.id, { name: '새이름' });
      expect(kept).toMatchObject({ zipCode: '06236', addressDetail: '5층' });

      const cleared = await service.update(s.id, {
        zipCode: null,
        address: null,
        addressDetail: null,
      });
      expect(cleared).toMatchObject({
        zipCode: null,
        address: null,
        addressDetail: null,
      });
    });

    it('학번을 다른 학생과 같게 바꿀 수는 없지만, 자기 학번 그대로는 괜찮다', async () => {
      const a = await service.create(dto({ studentNo: 'A-100' }));
      const b = await service.create(dto({ studentNo: 'B-200' }));

      await expect(
        service.update(b.id, { studentNo: 'A-100' }),
      ).rejects.toMatchObject({ code: 'STUDENT_NO_DUPLICATED' });
      await expect(
        service.update(a.id, { studentNo: 'A-100', name: '새이름' }),
      ).resolves.toMatchObject({ name: '새이름' });
    });

    it('없는 학생이나 삭제된 학생은 수정할 수 없다', async () => {
      await expect(service.update(999, { name: 'x' })).rejects.toMatchObject({
        code: 'STUDENT_NOT_FOUND',
      });
      const s = await service.create(dto());
      await service.remove(s.id);
      await expect(service.update(s.id, { name: 'x' })).rejects.toMatchObject({
        code: 'STUDENT_NOT_FOUND',
      });
    });
  });

  describe('재원 상태', () => {
    it('신청이 없으면 휴원·퇴원으로 바꿀 수 있고 다시 재원으로 돌릴 수 있다', async () => {
      const s = await service.create(dto());
      expect(await service.update(s.id, { status: 'ON_LEAVE' })).toMatchObject({
        status: 'ON_LEAVE',
      });
      expect(await service.update(s.id, { status: 'ENROLLED' })).toMatchObject({
        status: 'ENROLLED',
      });
    });

    it('활성 신청이 있으면 휴원·퇴원으로 바꿀 수 없고, 취소하면 바꿀 수 있다', async () => {
      const s = await service.create(dto());
      const room = await makeRoom();
      const visit = await visitService.create(room.id, {
        studentId: s.id,
        visitAt: DAY25,
      });

      await expect(
        service.update(s.id, { status: 'WITHDRAWN' }),
      ).rejects.toMatchObject({
        code: 'STUDENT_HAS_ACTIVE_VISITS',
        data: { visitIds: [visit.id] },
      });
      expect((await repo.findById(s.id))!.status).toBe('ENROLLED');

      await visitService.cancel(visit.id, { studentId: s.id });
      await expect(
        service.update(s.id, { status: 'WITHDRAWN' }),
      ).resolves.toMatchObject({ status: 'WITHDRAWN' });
    });

    it('휴원·퇴원 학생은 방문을 신청할 수 없고, 재원으로 돌아오면 신청할 수 있다', async () => {
      const s = await service.create(dto());
      const room = await makeRoom();
      await service.update(s.id, { status: 'ON_LEAVE' });

      await expect(
        visitService.create(room.id, { studentId: s.id, visitAt: DAY25 }),
      ).rejects.toMatchObject({ code: 'STUDENT_NOT_ENROLLED' });

      await service.update(s.id, { status: 'ENROLLED' });
      await expect(
        visitService.create(room.id, { studentId: s.id, visitAt: DAY25 }),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('퇴원 처리와 신청이 동시에 일어나도 "재원이 아닌 학생의 활성 신청"은 생기지 않는다', async () => {
      const s = await service.create(dto());
      const room = await makeRoom();

      await Promise.allSettled([
        service.update(s.id, { status: 'WITHDRAWN' }),
        visitService.create(room.id, { studentId: s.id, visitAt: DAY25 }),
      ]);

      const student = (await repo.findById(s.id))!;
      const active = await visits.findAll(
        (v) => v.studentId === s.id && v.status === 'ACTIVE',
      );
      expect(student.status !== 'ENROLLED' && active.length > 0).toBe(false);
    });
  });

  describe('삭제', () => {
    it('Soft Delete 라 행은 남고 deletedAt 만 채워진다', async () => {
      const s = await service.create(dto());
      await service.remove(s.id);
      expect((await repo.findById(s.id))!.deletedAt).toBe(NOW);
    });

    it('이미 삭제되었거나 없는 학생은 다시 삭제할 수 없다', async () => {
      const s = await service.create(dto());
      await service.remove(s.id);
      await expect(service.remove(s.id)).rejects.toMatchObject({
        code: 'STUDENT_NOT_FOUND',
      });
      await expect(service.remove(999)).rejects.toMatchObject({
        code: 'STUDENT_NOT_FOUND',
      });
    });

    it('방문 신청이 남아 있으면 삭제를 거부하고 어떤 신청인지 알려 준다', async () => {
      const s = await service.create(dto());
      const room = await makeRoom();
      const visit = await visitService.create(room.id, {
        studentId: s.id,
        visitAt: DAY25,
      });

      await expect(service.remove(s.id)).rejects.toMatchObject({
        code: 'STUDENT_HAS_ACTIVE_VISITS',
        data: { visitIds: [visit.id] },
      });
      expect((await repo.findById(s.id))!.deletedAt).toBeNull(); // 아무것도 바뀌지 않음
    });

    it('신청을 취소한 뒤에는 삭제할 수 있고, 이력의 이름은 계속 보인다', async () => {
      const s = await service.create(dto());
      const room = await makeRoom();
      const visit = await visitService.create(room.id, {
        studentId: s.id,
        visitAt: DAY25,
      });
      await visitService.cancel(visit.id, { studentId: s.id });

      await service.remove(s.id);

      const logs = await visitService.findHistories(room.id);
      expect(logs).toHaveLength(2);
      expect(logs.every((l) => l.studentName === '홍길동')).toBe(true);
    });

    it('삭제된 학생은 방문을 신청할 수 없다', async () => {
      const s = await service.create(dto());
      await service.remove(s.id);
      const room = await makeRoom();
      await expect(
        visitService.create(room.id, { studentId: s.id, visitAt: DAY25 }),
      ).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
    });

    it('삭제와 신청이 동시에 일어나도 "삭제된 학생의 활성 신청"은 생기지 않는다', async () => {
      const s = await service.create(dto());
      const room = await makeRoom();

      await Promise.allSettled([
        service.remove(s.id),
        visitService.create(room.id, { studentId: s.id, visitAt: DAY25 }),
      ]);

      const student = (await repo.findById(s.id))!;
      const active = await visits.findAll(
        (v) => v.studentId === s.id && v.status === 'ACTIVE',
      );
      // 둘 중 어느 쪽이 먼저든, 삭제된 학생이면서 활성 신청이 있는 상태는 안 된다
      expect(student.deletedAt !== null && active.length > 0).toBe(false);
    });
  });
});
