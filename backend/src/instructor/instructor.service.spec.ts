import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPassword } from '../auth/password';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { CreateInstructorDto } from './dto/instructor.dto';
import { INSTRUCTOR_COLLECTION, Instructor } from './instructor.entity';
import { InstructorService } from './instructor.service';

const NOW = '2026-11-24T00:00:00.000Z';

describe('InstructorService', () => {
  let dir: string;
  let db: JsonDatabase;
  let repo: JsonRepository<Instructor>;
  let service: InstructorService;
  let adminId: number; // 기본 강사(원장)의 id. 요청한 사람(actor)으로 쓴다.
  let seq: number;

  beforeEach(async () => {
    delete process.env.INSTRUCTOR_ID;
    delete process.env.INSTRUCTOR_PASSWORD;
    dir = await mkdtemp(join(tmpdir(), 'instructor-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    repo = new JsonRepository<Instructor>(db, INSTRUCTOR_COLLECTION);
    const clock = { now: () => new Date(NOW) } as Clock;
    service = new InstructorService(repo, db, clock);
    await service.onModuleInit(); // 기본 강사(admin) 생성
    adminId = (await service.findAll())[0].id;
    seq = 0;
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  // 매번 다른 아이디·사번을 쓰는 등록 입력 (필요한 값만 덮어쓴다)
  const dto = (
    over: Partial<CreateInstructorDto> = {},
  ): CreateInstructorDto => {
    seq += 1;
    return {
      loginId: `teacher${seq}`,
      password: 'pw1234',
      name: '김강사',
      employeeNo: `T-${100 + seq}`,
      phone: '010-1234-5678',
      ...over,
    };
  };

  it('처음 실행하면 기본 강사(원장) 계정이 하나 생기고, 목록에는 비밀번호 해시가 없다', async () => {
    const list = await service.findAll();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      loginId: 'admin',
      name: '원장',
      position: 'DIRECTOR',
      status: 'ACTIVE',
      subjects: [],
      deletedAt: null,
    });
    expect(JSON.stringify(list)).not.toMatch(/passwordHash/);
  });

  it('이전 데이터처럼 새 필드가 없는 강사는 시작할 때 기본값으로 채워진다', async () => {
    const [admin] = await repo.findAll();
    await db.transaction(async () => {
      const old = { ...admin } as Partial<Instructor>;
      delete old.deletedAt;
      delete old.status;
      delete old.position;
      delete old.employeeNo;
      await repo.update(old as Instructor);
    });
    await service.onModuleInit();
    expect((await repo.findAll())[0]).toMatchObject({
      deletedAt: null,
      status: 'ACTIVE',
      position: 'LECTURER',
      employeeNo: null,
    });
  });

  describe('등록', () => {
    it('공백을 정리해 저장하고 재직 상태로 시작하며, 비밀번호는 해시로만 저장한다', async () => {
      const created = await service.create(
        dto({
          loginId: ' teacher1 ',
          name: ' 김강사 ',
          employeeNo: ' T-1 ',
          email: ' ',
          memo: ' 메모 ',
        }),
      );
      expect(created).toMatchObject({
        loginId: 'teacher1',
        name: '김강사',
        employeeNo: 'T-1',
        phone: '010-1234-5678',
        email: null, // 공백뿐이면 "없음"
        position: 'LECTURER', // 안 보내면 기본값
        subjects: [],
        status: 'ACTIVE',
        hireDate: null,
        memo: '메모',
        deletedAt: null,
      });
      const stored = (await repo.findAll()).find((i) => i.id === created.id)!;
      expect(stored.passwordHash).not.toBe('pw1234');
      expect(await verifyPassword('pw1234', stored.passwordHash)).toBe(true);
    });

    it('직책·담당 과목·입사일·이메일을 저장한다 (담당 과목은 중복을 없애고 정해진 순서로)', async () => {
      const created = await service.create(
        dto({
          position: 'HOMEROOM',
          subjects: ['MATH', 'KOREAN', 'MATH'],
          hireDate: '2025-03-02',
          email: 'kim@example.com',
        }),
      );
      expect(created).toMatchObject({
        position: 'HOMEROOM',
        subjects: ['KOREAN', 'MATH'],
        hireDate: '2025-03-02',
        email: 'kim@example.com',
      });
    });

    it('실제로 없는 입사일(2월 31일)은 거부한다', async () => {
      await expect(
        service.create(dto({ hireDate: '2026-02-31' })),
      ).rejects.toMatchObject({ code: 'INVALID_HIRE_DATE' });
    });

    it('이미 쓰는 아이디·사번으로는 등록할 수 없다', async () => {
      const a = await service.create(dto());
      await expect(
        service.create(dto({ loginId: a.loginId })),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_LOGIN_ID_DUPLICATED' });
      await expect(
        service.create(dto({ employeeNo: a.employeeNo! })),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_EMPLOYEE_NO_DUPLICATED' });
      expect(await service.findAll()).toHaveLength(2);
    });

    it('동시에 같은 아이디(또는 같은 사번)로 등록하면 한 명만 등록된다', async () => {
      const sameLogin = await Promise.allSettled([
        service.create(dto({ loginId: 'same', name: '가' })),
        service.create(dto({ loginId: 'same', name: '나' })),
        service.create(dto({ loginId: 'same', name: '다' })),
      ]);
      expect(sameLogin.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

      const sameNo = await Promise.allSettled([
        service.create(dto({ employeeNo: 'DUP-1' })),
        service.create(dto({ employeeNo: 'DUP-1' })),
      ]);
      expect(sameNo.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of [...sameLogin, ...sameNo]) {
        if (r.status === 'rejected') {
          expect([
            'INSTRUCTOR_LOGIN_ID_DUPLICATED',
            'INSTRUCTOR_EMPLOYEE_NO_DUPLICATED',
          ]).toContain(r.reason.code);
        }
      }
    });
  });

  describe('수정', () => {
    it('보낸 필드만 바꾸고, 선택 값은 null 을 보내면 비워지며, 비밀번호를 보내면 재설정한다', async () => {
      const t = await service.create(
        dto({ email: 'a@b.com', subjects: ['MATH'], memo: '메모' }),
      );
      const updated = await service.update(
        t.id,
        { name: '새이름', position: 'VICE_DIRECTOR' },
        adminId,
      );
      expect(updated).toMatchObject({
        name: '새이름',
        position: 'VICE_DIRECTOR',
        email: 'a@b.com', // 안 보낸 값은 유지
        subjects: ['MATH'],
        loginId: t.loginId,
      });
      expect(updated.version).toBeGreaterThan(t.version);

      const cleared = await service.update(
        t.id,
        { email: null, memo: null, subjects: [] },
        adminId,
      );
      expect(cleared).toMatchObject({ email: null, memo: null, subjects: [] });

      await service.update(t.id, { password: 'newpass' }, adminId);
      const stored = (await repo.findAll()).find((i) => i.id === t.id)!;
      expect(await verifyPassword('newpass', stored.passwordHash)).toBe(true);
      expect(await verifyPassword('pw1234', stored.passwordHash)).toBe(false);
    });

    it('아이디·사번을 다른 강사와 같게 바꿀 수는 없지만, 자기 값 그대로는 괜찮다', async () => {
      const a = await service.create(
        dto({ loginId: 'aaa', employeeNo: 'A-1' }),
      );
      const b = await service.create(
        dto({ loginId: 'bbb', employeeNo: 'B-1' }),
      );
      await expect(
        service.update(a.id, { loginId: 'bbb' }, adminId),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_LOGIN_ID_DUPLICATED' });
      await expect(
        service.update(a.id, { employeeNo: b.employeeNo! }, adminId),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_EMPLOYEE_NO_DUPLICATED' });
      await expect(
        service.update(
          a.id,
          { loginId: 'aaa', employeeNo: 'A-1', name: '이름' },
          adminId,
        ),
      ).resolves.toMatchObject({ name: '이름' });
    });

    it('없는 강사는 수정할 수 없다', async () => {
      await expect(
        service.update(999, { name: 'x' }, adminId),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
    });
  });

  describe('재직 상태', () => {
    it('휴직·퇴직으로 바꾸고 다시 재직으로 돌릴 수 있다 (퇴직해도 목록에는 남는다)', async () => {
      const t = await service.create(dto());
      await expect(
        service.update(t.id, { status: 'ON_LEAVE' }, adminId),
      ).resolves.toMatchObject({ status: 'ON_LEAVE' });
      await expect(
        service.update(t.id, { status: 'RESIGNED' }, adminId),
      ).resolves.toMatchObject({ status: 'RESIGNED' });
      expect(
        (await service.findAll()).find((i) => i.id === t.id),
      ).toMatchObject({
        status: 'RESIGNED',
      });
      await expect(
        service.update(t.id, { status: 'ACTIVE' }, adminId),
      ).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('자기 자신은 퇴직 처리할 수 없다 (휴직은 가능)', async () => {
      await expect(
        service.update(adminId, { status: 'RESIGNED' }, adminId),
      ).rejects.toMatchObject({ code: 'CANNOT_RESIGN_SELF' });
      await expect(
        service.update(adminId, { status: 'ON_LEAVE' }, adminId),
      ).resolves.toMatchObject({ status: 'ON_LEAVE' });
    });

    it('이미 퇴직한 강사는 다른 강사를 퇴직 처리할 수 없다', async () => {
      const t = await service.create(dto());
      const other = await service.create(dto());
      await service.update(t.id, { status: 'RESIGNED' }, adminId);
      await expect(
        service.update(other.id, { status: 'RESIGNED' }, t.id),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('두 강사가 서로를 동시에 퇴직 처리해도 한 명은 재직 상태로 남는다', async () => {
      const t = await service.create(dto());
      const results = await Promise.allSettled([
        service.update(t.id, { status: 'RESIGNED' }, adminId),
        service.update(adminId, { status: 'RESIGNED' }, t.id),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const active = (await service.findAll()).filter(
        (i) => i.status !== 'RESIGNED',
      );
      expect(active).toHaveLength(1);
    });
  });

  describe('삭제', () => {
    it('다른 강사를 삭제하면 목록에서 사라지고, 그 아이디·사번은 다시 쓸 수 있다', async () => {
      const t = await service.create(
        dto({ loginId: 'gone', employeeNo: 'G-1' }),
      );
      await service.remove(t.id, adminId);

      expect((await service.findAll()).map((i) => i.loginId)).toEqual([
        'admin',
      ]);
      // 행은 남아 있다 (Soft Delete)
      expect((await repo.findAll()).find((i) => i.id === t.id)!.deletedAt).toBe(
        NOW,
      );
      // 삭제된 아이디·사번 재사용, 삭제된 강사는 수정·재삭제 불가
      await expect(
        service.create(dto({ loginId: 'gone', employeeNo: 'G-1' })),
      ).resolves.toMatchObject({ loginId: 'gone' });
      await expect(
        service.update(t.id, { name: 'x' }, adminId),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
      await expect(service.remove(t.id, adminId)).rejects.toMatchObject({
        code: 'INSTRUCTOR_NOT_FOUND',
      });
    });

    it('자기 자신은 삭제할 수 없다', async () => {
      await expect(service.remove(adminId, adminId)).rejects.toMatchObject({
        code: 'CANNOT_DELETE_SELF',
      });
      expect(await service.findAll()).toHaveLength(1);
    });

    it('두 강사가 서로를 동시에 삭제해도 한 명은 남는다', async () => {
      const t = await service.create(dto());
      const results = await Promise.allSettled([
        service.remove(t.id, adminId), // admin 이 t 를 삭제
        service.remove(adminId, t.id), // t 가 admin 을 삭제
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await service.findAll()).toHaveLength(1);
    });
  });
});
