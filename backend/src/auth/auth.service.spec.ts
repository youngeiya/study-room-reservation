import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock } from '../common/clock.service';
import {
  INSTRUCTOR_COLLECTION,
  Instructor,
} from '../instructor/instructor.entity';
import { InstructorService } from '../instructor/instructor.service';
import { JsonDatabase } from '../storage/json-database';
import type { Repository } from '../storage/repository';
import { STUDENT_COLLECTION, Student } from '../student/student.entity';
import { StudentService } from '../student/student.service';
import { VISIT_COLLECTION, VisitReservation } from '../visit/visit.entity';
import { AuthService } from './auth.service';
import { LoginAttemptService } from './login-attempt.service';
import { hashPassword, verifyPassword } from './password';
import { TokenService } from './token.service';

describe('비밀번호 해시', () => {
  it('원문이 아니라 해시를 저장하고, 같은 비밀번호여도 매번 다른 값이 나온다', async () => {
    const a = await hashPassword('secret-1234');
    const b = await hashPassword('secret-1234');
    expect(a).not.toContain('secret-1234');
    expect(a).not.toBe(b); // salt 가 달라서
    expect(await verifyPassword('secret-1234', a)).toBe(true);
    expect(await verifyPassword('secret-1234', b)).toBe(true);
  });

  it('틀린 비밀번호, 없는 해시, 형식이 깨진 해시는 모두 거부한다', async () => {
    const hash = await hashPassword('secret-1234');
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('secret-1234', null)).toBe(false);
    expect(await verifyPassword('secret-1234', '')).toBe(false);
    expect(await verifyPassword('secret-1234', 'garbage')).toBe(false);
  });
});

describe('TokenService', () => {
  const user = {
    role: 'STUDENT' as const,
    id: 7,
    name: '홍길동',
    loginId: '2026007',
  };

  it('발급한 토큰은 같은 사용자 정보로 검증된다', () => {
    const tokens = new TokenService();
    expect(tokens.verify(tokens.sign(user))).toEqual(user);
  });

  it('위조·손상된 토큰과 다른 서버의 비밀키로 서명한 토큰은 거부한다', () => {
    const tokens = new TokenService();
    const other = new TokenService(); // 비밀키가 다른 인스턴스(JWT_SECRET 이 없으면 무작위)
    const token = tokens.sign(user);
    expect(() => tokens.verify(token + 'x')).toThrow();
    expect(() => tokens.verify('not-a-token')).toThrow();
    expect(() => tokens.verify(other.sign(user))).toThrow();
  });
});

describe('AuthService', () => {
  let dir: string;
  let db: JsonDatabase;
  let auth: AuthService;
  let students: StudentService;
  let studentRepo: Repository<Student>;

  beforeEach(async () => {
    delete process.env.INSTRUCTOR_ID;
    delete process.env.INSTRUCTOR_PASSWORD;
    dir = await mkdtemp(join(tmpdir(), 'auth-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    const clock = new Clock();
    const instructorRepo = db.repository<Instructor>(INSTRUCTOR_COLLECTION);
    studentRepo = db.repository<Student>(STUDENT_COLLECTION);
    const visitRepo = db.repository<VisitReservation>(VISIT_COLLECTION);
    await new InstructorService(instructorRepo, db, clock).onModuleInit();
    students = new StudentService(studentRepo, visitRepo, db, clock);
    await students.onModuleInit(); // 시드 학생 5명 (초기 비밀번호 = 학번)
    auth = new AuthService(
      instructorRepo,
      studentRepo,
      new TokenService(),
      db,
      clock,
      new LoginAttemptService(clock),
    );
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  describe('로그인', () => {
    it('기본 강사 계정(admin)으로 강사 로그인이 된다', async () => {
      const result = await auth.login('INSTRUCTOR', 'admin', 'admin1234');
      expect(result.user).toMatchObject({
        role: 'INSTRUCTOR',
        loginId: 'admin',
      });
      expect(result.token).toEqual(expect.any(String));
    });

    it('학생은 학번과 초기 비밀번호(학번)로 로그인한다', async () => {
      const result = await auth.login('STUDENT', '2026001', '2026001');
      expect(result.user).toMatchObject({
        role: 'STUDENT',
        name: '김민준',
        loginId: '2026001',
      });
    });

    it('비밀번호가 틀리거나 없는 아이디면 같은 오류로 거부한다 (어느 쪽인지 알려 주지 않는다)', async () => {
      const wrongPassword = await auth
        .login('STUDENT', '2026001', 'wrong')
        .catch((e) => e);
      const unknownId = await auth
        .login('STUDENT', '9999999', 'wrong')
        .catch((e) => e);
      expect(wrongPassword).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(unknownId).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(wrongPassword.message).toBe(unknownId.message);
    });

    it('역할이 섞이지 않는다: 학생 학번으로 강사 로그인, 강사 아이디로 학생 로그인은 안 된다', async () => {
      await expect(
        auth.login('INSTRUCTOR', '2026001', '2026001'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(
        auth.login('STUDENT', 'admin', 'admin1234'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('삭제된 학생과 퇴원 학생은 로그인할 수 없고, 휴원 학생은 할 수 있다', async () => {
      const list = await students.findAll();
      const [a, b, c] = list;
      await students.remove(a.id);
      await students.update(b.id, { status: 'WITHDRAWN' });
      await students.update(c.id, { status: 'ON_LEAVE' });

      await expect(
        auth.login('STUDENT', a.studentNo!, a.studentNo!),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(
        auth.login('STUDENT', b.studentNo!, b.studentNo!),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(
        auth.login('STUDENT', c.studentNo!, c.studentNo!),
      ).resolves.toBeDefined();
    });

    it('새로 등록한 학생은 초기 비밀번호가 학번이고, 강사가 정하면 그 값이다', async () => {
      await students.create({
        name: '신입',
        phone: '010-1234-5678',
        studentNo: 'N-100',
      });
      await students.create({
        name: '신입2',
        phone: '010-1234-5678',
        studentNo: 'N-200',
        password: 'custom-pass',
      });
      await expect(
        auth.login('STUDENT', 'N-100', 'N-100'),
      ).resolves.toBeDefined();
      await expect(
        auth.login('STUDENT', 'N-200', 'N-200'),
      ).rejects.toBeDefined();
      await expect(
        auth.login('STUDENT', 'N-200', 'custom-pass'),
      ).resolves.toBeDefined();
    });

    it('학생 목록 응답에는 비밀번호 해시가 들어 있지 않다', async () => {
      const list = await students.findAll();
      expect(list.every((s) => !('passwordHash' in s))).toBe(true);
      const created = await students.create({
        name: '신입',
        phone: '010-1234-5678',
        studentNo: 'N-100',
      });
      expect('passwordHash' in created).toBe(false);
    });
  });

  describe('비밀번호 변경', () => {
    it('현재 비밀번호가 맞으면 바뀌고, 이전 비밀번호로는 로그인할 수 없다', async () => {
      const { user } = await auth.login('STUDENT', '2026001', '2026001');
      await auth.changePassword(user, '2026001', 'new-password');

      await expect(
        auth.login('STUDENT', '2026001', '2026001'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      await expect(
        auth.login('STUDENT', '2026001', 'new-password'),
      ).resolves.toBeDefined();
    });

    it('현재 비밀번호가 틀리면 바뀌지 않는다 (강사도 마찬가지)', async () => {
      const { user } = await auth.login('INSTRUCTOR', 'admin', 'admin1234');
      await expect(
        auth.changePassword(user, 'wrong', 'new-password'),
      ).rejects.toMatchObject({ code: 'WRONG_CURRENT_PASSWORD' });
      await auth.changePassword(user, 'admin1234', 'new-password');
      await expect(
        auth.login('INSTRUCTOR', 'admin', 'new-password'),
      ).resolves.toBeDefined();
    });

    it('강사가 학생의 비밀번호를 재설정할 수 있다', async () => {
      const [first] = await students.findAll();
      await students.update(first.id, { password: 'reset-1234' });
      await expect(
        auth.login('STUDENT', first.studentNo!, 'reset-1234'),
      ).resolves.toBeDefined();
    });
  });

  describe('내 정보 확인(me)', () => {
    it('로그인 뒤 학생이 삭제되면 UNAUTHORIZED 가 된다', async () => {
      const { user } = await auth.login('STUDENT', '2026001', '2026001');
      await expect(auth.me(user)).resolves.toMatchObject({ id: user.id });
      await students.remove(user.id);
      await expect(auth.me(user)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  it('이전 형식 학생(비밀번호 없음)은 시작할 때 학번이 초기 비밀번호로 채워진다', async () => {
    await db.transaction(() =>
      studentRepo.create({
        name: '옛학생',
        phone: '010-0000-0000',
        studentNo: 'OLD-1',
        passwordHash: null,
        guardianPhone: null,
        zipCode: null,
        address: null,
        addressDetail: null,
        grade: null,
        memo: null,
        status: 'ENROLLED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as never),
    );
    await expect(auth.login('STUDENT', 'OLD-1', 'OLD-1')).rejects.toBeDefined();

    await students.onModuleInit(); // 앱이 다시 뜰 때 보정된다

    await expect(
      auth.login('STUDENT', 'OLD-1', 'OLD-1'),
    ).resolves.toBeDefined();
  });
});

describe('로그인 시도 제한', () => {
  let dir: string;
  let db: JsonDatabase;
  let auth: AuthService;
  let students: StudentService;
  let nowMs: number;

  beforeEach(async () => {
    delete process.env.LOGIN_MAX_ATTEMPTS;
    delete process.env.LOGIN_LOCK_MINUTES;
    delete process.env.INSTRUCTOR_ID;
    delete process.env.INSTRUCTOR_PASSWORD;
    dir = await mkdtemp(join(tmpdir(), 'lock-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    nowMs = Date.parse('2026-11-24T00:00:00.000Z');
    const clock = { now: () => new Date(nowMs) } as Clock; // 시각을 직접 움직인다
    const instructorRepo = db.repository<Instructor>(INSTRUCTOR_COLLECTION);
    const studentRepo = db.repository<Student>(STUDENT_COLLECTION);
    const visitRepo = db.repository<VisitReservation>(VISIT_COLLECTION);
    await new InstructorService(instructorRepo, db, clock).onModuleInit();
    students = new StudentService(studentRepo, visitRepo, db, clock);
    await students.onModuleInit();
    auth = new AuthService(
      instructorRepo,
      studentRepo,
      new TokenService(),
      db,
      clock,
      new LoginAttemptService(clock),
    );
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const fail = (id = '2026001') =>
    auth.login('STUDENT', id, 'wrong').catch((e) => e);

  it('연속 5번 실패하면 올바른 비밀번호로도 잠겨서 로그인할 수 없다', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await fail()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    const locked = await auth
      .login('STUDENT', '2026001', '2026001')
      .catch((e) => e);
    expect(locked).toMatchObject({
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      data: { retryAfterSeconds: 300 },
    });
  });

  it('4번 실패한 뒤 성공하면 횟수가 지워진다', async () => {
    for (let i = 0; i < 4; i++) await fail();
    await expect(
      auth.login('STUDENT', '2026001', '2026001'),
    ).resolves.toBeDefined();
    for (let i = 0; i < 4; i++) await fail(); // 다시 4번까지는 잠기지 않는다
    await expect(
      auth.login('STUDENT', '2026001', '2026001'),
    ).resolves.toBeDefined();
  });

  it('5분이 지나면 잠금이 풀린다', async () => {
    for (let i = 0; i < 5; i++) await fail();
    nowMs += 4 * 60_000;
    expect(await fail()).toMatchObject({ code: 'TOO_MANY_LOGIN_ATTEMPTS' });
    nowMs += 61_000; // 잠긴 지 5분 1초 뒤
    await expect(
      auth.login('STUDENT', '2026001', '2026001'),
    ).resolves.toBeDefined();
  });

  it('다른 계정과 다른 역할은 영향받지 않는다', async () => {
    for (let i = 0; i < 5; i++) await fail('2026001');
    await expect(
      auth.login('STUDENT', '2026002', '2026002'),
    ).resolves.toBeDefined();
    await expect(
      auth.login('INSTRUCTOR', 'admin', 'admin1234'),
    ).resolves.toBeDefined();
  });

  it('없는 아이디도 똑같이 세어서, 잠금 여부로 존재 여부를 알 수 없다', async () => {
    for (let i = 0; i < 5; i++) await fail('9999999');
    expect(await fail('9999999')).toMatchObject({
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
    });
  });

  it('대소문자·공백을 바꿔도 제한을 피할 수 없고, 한도·시간은 환경 변수로 바꾼다', async () => {
    process.env.LOGIN_MAX_ATTEMPTS = '2';
    process.env.LOGIN_LOCK_MINUTES = '1';
    await auth.login('INSTRUCTOR', 'ADMIN', 'wrong').catch(() => undefined);
    await auth.login('INSTRUCTOR', ' admin ', 'wrong').catch(() => undefined);
    const locked = await auth
      .login('INSTRUCTOR', 'Admin', 'admin1234')
      .catch((e) => e);
    expect(locked).toMatchObject({
      code: 'TOO_MANY_LOGIN_ATTEMPTS',
      data: { retryAfterSeconds: 60 },
    });
  });
});
