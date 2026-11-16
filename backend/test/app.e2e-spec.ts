import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * 로그인·권한 e2e 테스트: 실제 앱을 띄우고 HTTP 로 호출해서
 * "누가 어떤 API 를 쓸 수 있는가"를 확인한다. (임시 JSON DB 사용, Oracle 과 무관)
 */
describe('로그인과 권한 (e2e)', () => {
  let app: INestApplication<App>;
  let dir: string;
  let instructor: string; // 강사 토큰
  let student1: string; // 학생 토큰 (김민준, 학번 2026001)
  let student2: string; // 학생 토큰 (이서연, 학번 2026002)
  let roomId: number;

  const day = 24 * 60 * 60 * 1000;
  const iso = (d: number) => new Date(Date.now() + d * day).toISOString();
  const api = () => request(app.getHttpServer());
  const login = async (role: string, loginId: string, password: string) =>
    api().post('/api/auth/login').send({ role, loginId, password });
  const tokenOf = async (role: string, loginId: string, password: string) =>
    (await login(role, loginId, password)).body.data.token as string;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'e2e-'));
    process.env.DB_TYPE = 'json';
    process.env.DB_FILE = join(dir, 'db.json');
    process.env.JWT_SECRET = 'e2e-test-secret-key-0123456789';
    delete process.env.INSTRUCTOR_ID;
    delete process.env.INSTRUCTOR_PASSWORD;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // main.ts 와 같은 설정
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    instructor = await tokenOf('INSTRUCTOR', 'admin', 'admin1234');
    student1 = await tokenOf('STUDENT', '2026001', '2026001');
    student2 = await tokenOf('STUDENT', '2026002', '2026002');
    const room = await api()
      .post('/api/study-rooms')
      .set(bearer(instructor))
      .send({
        name: 'e2e 자습실',
        maxPersonnel: 5,
        startDate: iso(-1),
        endDate: iso(30),
      })
      .expect(201);
    roomId = room.body.data.id;
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  describe('로그인', () => {
    it('강사·학생이 각자의 역할로 로그인하면 토큰과 사용자 정보가 나온다', async () => {
      const res = await login('STUDENT', '2026001', '2026001').then((r) => r);
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        role: 'STUDENT',
        name: '김민준',
        loginId: '2026001',
      });
      expect(res.body.data.token).toEqual(expect.any(String));
      // 응답 어디에도 비밀번호 해시가 없다
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it('틀린 비밀번호·없는 아이디·역할 불일치는 모두 401 INVALID_CREDENTIALS', async () => {
      for (const [role, id, pw] of [
        ['STUDENT', '2026001', 'wrong'],
        ['STUDENT', '0000000', 'wrong'],
        ['INSTRUCTOR', '2026001', '2026001'], // 학생 계정으로 강사 로그인
        ['STUDENT', 'admin', 'admin1234'], // 강사 계정으로 학생 로그인
      ]) {
        const res = await login(role, id, pw);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('role 이 잘못되었거나 값이 빠지면 400', async () => {
      await api()
        .post('/api/auth/login')
        .send({ role: 'ADMIN', loginId: 'x', password: 'y' })
        .expect(400);
      await api().post('/api/auth/login').send({ role: 'STUDENT' }).expect(400);
    });

    it('/auth/me 는 토큰의 사용자 정보를 돌려준다', async () => {
      const res = await api()
        .get('/api/auth/me')
        .set(bearer(student1))
        .expect(200);
      expect(res.body.data).toMatchObject({ role: 'STUDENT', name: '김민준' });
    });
  });

  describe('로그인하지 않았거나 토큰이 잘못된 경우', () => {
    it('토큰 없이 API 를 호출하면 401 UNAUTHORIZED', async () => {
      for (const path of [
        '/api/study-rooms',
        '/api/students',
        '/api/auth/me',
      ]) {
        const res = await api().get(path);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
      }
    });

    it('위조·손상된 토큰과 Bearer 형식이 아닌 헤더도 401', async () => {
      await api()
        .get('/api/study-rooms')
        .set(bearer(student1 + 'x'))
        .expect(401);
      await api()
        .get('/api/study-rooms')
        .set({ Authorization: 'Bearer not-a-token' })
        .expect(401);
      await api()
        .get('/api/study-rooms')
        .set({ Authorization: student1 }) // "Bearer " 가 없음
        .expect(401);
    });
  });

  describe('학생이 할 수 있는 일과 없는 일', () => {
    it('자습실 목록·상세는 볼 수 있다', async () => {
      await api().get('/api/study-rooms').set(bearer(student1)).expect(200);
      await api()
        .get(`/api/study-rooms/${roomId}`)
        .set(bearer(student1))
        .expect(200);
    });

    it('자습실 등록·수정·삭제, 학생 관리, 이력 조회는 403 FORBIDDEN', async () => {
      const t = bearer(student1);
      const forbidden = [
        api()
          .post('/api/study-rooms')
          .set(t)
          .send({
            name: 'x',
            maxPersonnel: 1,
            startDate: iso(0),
            endDate: iso(1),
          }),
        api().patch(`/api/study-rooms/${roomId}`).set(t).send({ name: 'x' }),
        api().delete(`/api/study-rooms/${roomId}`).set(t),
        api().get('/api/students').set(t),
        api()
          .post('/api/students')
          .set(t)
          .send({ name: 'x', phone: '010-1234-5678', studentNo: 'X-1' }),
        api().delete('/api/students/1').set(t),
        api().get(`/api/study-rooms/${roomId}/histories`).set(t),
      ];
      for (const res of await Promise.all(forbidden)) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
    });

    it('방문 신청은 body 의 studentId 가 아니라 로그인한 학생으로 처리된다', async () => {
      // 남의 학생 번호를 body 에 넣어도 받아 주지 않는다 (정의되지 않은 필드는 400)
      await api()
        .post(`/api/study-rooms/${roomId}/visits`)
        .set(bearer(student1))
        .send({ studentId: 2, visitAt: iso(2) })
        .expect(400);

      const res = await api()
        .post(`/api/study-rooms/${roomId}/visits`)
        .set(bearer(student1))
        .send({ visitAt: iso(2) })
        .expect(201);
      expect(res.body.data.studentId).toBe(1); // 김민준 (토큰의 학생)
    });

    it('예약 가능 기간(3일)을 넘기거나 과거 시간이면 400, 정책은 로그인한 누구나 조회할 수 있다', async () => {
      const tooFar = await api()
        .post(`/api/study-rooms/${roomId}/visits`)
        .set(bearer(student2))
        .send({ visitAt: iso(5) });
      expect(tooFar.status).toBe(400);
      expect(tooFar.body.code).toBe('VISIT_TOO_FAR');
      expect(tooFar.body.data).toEqual({ maxDaysAhead: 3 });

      const past = await api()
        .post(`/api/study-rooms/${roomId}/visits`)
        .set(bearer(student2))
        .send({ visitAt: iso(-0.5) });
      expect(past.status).toBe(400);
      expect(past.body.code).toBe('VISIT_IN_PAST');

      for (const token of [student1, instructor]) {
        const res = await api()
          .get('/api/booking-policy')
          .set(bearer(token))
          .expect(200);
        expect(res.body.data).toEqual({ maxDaysAhead: 3 });
      }
      await api().get('/api/booking-policy').expect(401);
    });

    it('내 신청 목록은 볼 수 있지만 다른 학생의 목록은 403', async () => {
      const mine = await api()
        .get('/api/students/1/visits')
        .set(bearer(student1))
        .expect(200);
      expect(mine.body.data).toHaveLength(1);
      await api()
        .get('/api/students/1/visits')
        .set(bearer(student2))
        .expect(403);
    });

    it('다른 학생의 신청을 수정·취소할 수 없다', async () => {
      const visitId = (
        await api()
          .get('/api/students/1/visits')
          .set(bearer(student1))
          .expect(200)
      ).body.data[0].id;

      const patch = await api()
        .patch(`/api/visits/${visitId}`)
        .set(bearer(student2))
        .send({ visitAt: iso(2.5) });
      expect(patch.status).toBe(403);
      expect(patch.body.code).toBe('NOT_VISIT_OWNER');

      const cancel = await api()
        .post(`/api/visits/${visitId}/cancel`)
        .set(bearer(student2));
      expect(cancel.status).toBe(403);
      expect(cancel.body.code).toBe('NOT_VISIT_OWNER');

      // 본인은 수정·취소할 수 있다
      await api()
        .patch(`/api/visits/${visitId}`)
        .set(bearer(student1))
        .send({ visitAt: iso(2.5) })
        .expect(200);
      await api()
        .post(`/api/visits/${visitId}/cancel`)
        .set(bearer(student1))
        .expect(200);
    });
  });

  describe('강사가 할 수 있는 일과 없는 일', () => {
    it('자습실 수정, 학생 목록(해시 없음)·등록·수정, 이력 조회를 할 수 있다', async () => {
      const t = bearer(instructor);
      await api()
        .patch(`/api/study-rooms/${roomId}`)
        .set(t)
        .send({ name: '수정된 자습실' })
        .expect(200);

      const list = await api().get('/api/students').set(t).expect(200);
      expect(list.body.data).toHaveLength(5);
      expect(JSON.stringify(list.body)).not.toMatch(/passwordHash/);

      const created = await api()
        .post('/api/students')
        .set(t)
        .send({ name: '신입', phone: '010-1234-5678', studentNo: 'E2E-1' })
        .expect(201);
      expect(JSON.stringify(created.body)).not.toMatch(/passwordHash/);
      // 초기 비밀번호는 학번
      await login('STUDENT', 'E2E-1', 'E2E-1').then((r) =>
        expect(r.status).toBe(200),
      );

      const histories = await api()
        .get(`/api/study-rooms/${roomId}/histories`)
        .set(t)
        .expect(200);
      expect(histories.body.data.length).toBeGreaterThan(0);

      // 강사는 어떤 학생의 신청 목록이든 볼 수 있다
      await api().get('/api/students/1/visits').set(t).expect(200);
    });

    it('방문 신청·수정·취소는 학생 전용이라 강사는 403', async () => {
      const t = bearer(instructor);
      for (const res of await Promise.all([
        api()
          .post(`/api/study-rooms/${roomId}/visits`)
          .set(t)
          .send({ visitAt: iso(2) }),
        api()
          .patch('/api/visits/1')
          .set(t)
          .send({ visitAt: iso(2) }),
        api().post('/api/visits/1/cancel').set(t),
      ])) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('비밀번호 변경', () => {
    it('현재 비밀번호가 틀리면 400, 맞으면 바뀌고 새 비밀번호로만 로그인된다', async () => {
      const t = bearer(student2);
      const wrong = await api()
        .patch('/api/auth/password')
        .set(t)
        .send({ currentPassword: 'wrong', newPassword: 'new-pass-1' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('WRONG_CURRENT_PASSWORD');

      await api()
        .patch('/api/auth/password')
        .set(t)
        .send({ currentPassword: '2026002', newPassword: 'new-pass-1' })
        .expect(200);

      expect((await login('STUDENT', '2026002', '2026002')).status).toBe(401);
      expect((await login('STUDENT', '2026002', 'new-pass-1')).status).toBe(
        200,
      );
    });

    it('새 비밀번호가 너무 짧으면 400', async () => {
      await api()
        .patch('/api/auth/password')
        .set(bearer(instructor))
        .send({ currentPassword: 'admin1234', newPassword: 'abc' })
        .expect(400);
    });
  });
});
