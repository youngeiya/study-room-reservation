import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPassword } from '../auth/password';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { INSTRUCTOR_COLLECTION, Instructor } from './instructor.entity';
import { InstructorService } from './instructor.service';

const NOW = '2026-11-24T00:00:00.000Z';

describe('InstructorService', () => {
  let dir: string;
  let db: JsonDatabase;
  let repo: JsonRepository<Instructor>;
  let service: InstructorService;

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
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const dto = (
    over: Partial<{ loginId: string; name: string; password: string }> = {},
  ) => ({
    loginId: 'teacher1',
    name: '김강사',
    password: 'pw1234',
    ...over,
  });

  it('처음 실행하면 기본 강사 계정이 하나 생기고, 목록에는 비밀번호 해시가 없다', async () => {
    const list = await service.findAll();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      loginId: 'admin',
      name: '원장',
      deletedAt: null,
    });
    expect(JSON.stringify(list)).not.toMatch(/passwordHash/);
  });

  it('이전 데이터처럼 deletedAt 이 없는 강사는 시작할 때 null 로 채워진다', async () => {
    const [admin] = await repo.findAll();
    await db.transaction(async () => {
      const old = { ...admin } as Partial<Instructor>;
      delete old.deletedAt;
      await repo.update(old as Instructor);
    });
    await service.onModuleInit();
    expect((await repo.findAll())[0].deletedAt).toBeNull();
  });

  describe('등록', () => {
    it('공백을 정리해 저장하고 비밀번호는 해시로만 저장한다', async () => {
      const created = await service.create(
        dto({ loginId: ' teacher1 ', name: ' 김강사 ' }),
      );
      expect(created).toMatchObject({
        loginId: 'teacher1',
        name: '김강사',
        deletedAt: null,
      });
      const stored = (await repo.findAll()).find((i) => i.id === created.id)!;
      expect(stored.passwordHash).not.toBe('pw1234');
      expect(await verifyPassword('pw1234', stored.passwordHash)).toBe(true);
    });

    it('이미 쓰는 아이디로는 등록할 수 없다', async () => {
      await service.create(dto());
      await expect(
        service.create(dto({ name: '다른 사람' })),
      ).rejects.toMatchObject({
        code: 'INSTRUCTOR_LOGIN_ID_DUPLICATED',
      });
      expect(await service.findAll()).toHaveLength(2);
    });

    it('동시에 같은 아이디로 등록하면 한 명만 등록된다', async () => {
      const results = await Promise.allSettled([
        service.create(dto({ name: '가' })),
        service.create(dto({ name: '나' })),
        service.create(dto({ name: '다' })),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toMatchObject({
            code: 'INSTRUCTOR_LOGIN_ID_DUPLICATED',
          });
        }
      }
      expect(await service.findAll()).toHaveLength(2); // admin + 1
    });
  });

  describe('수정', () => {
    it('보낸 필드만 바꾸고, 비밀번호를 보내면 재설정한다', async () => {
      const t = await service.create(dto());
      const updated = await service.update(t.id, { name: '새이름' });
      expect(updated).toMatchObject({ name: '새이름', loginId: 'teacher1' });
      expect(updated.version).toBeGreaterThan(t.version);

      await service.update(t.id, { password: 'newpass' });
      const stored = (await repo.findAll()).find((i) => i.id === t.id)!;
      expect(await verifyPassword('newpass', stored.passwordHash)).toBe(true);
      expect(await verifyPassword('pw1234', stored.passwordHash)).toBe(false);
    });

    it('아이디를 다른 강사와 같게 바꿀 수는 없지만, 자기 아이디 그대로는 괜찮다', async () => {
      const a = await service.create(dto({ loginId: 'aaa' }));
      await service.create(dto({ loginId: 'bbb' }));
      await expect(
        service.update(a.id, { loginId: 'bbb' }),
      ).rejects.toMatchObject({
        code: 'INSTRUCTOR_LOGIN_ID_DUPLICATED',
      });
      await expect(
        service.update(a.id, { loginId: 'aaa', name: '이름' }),
      ).resolves.toMatchObject({ name: '이름' });
    });

    it('없는 강사는 수정할 수 없다', async () => {
      await expect(service.update(999, { name: 'x' })).rejects.toMatchObject({
        code: 'INSTRUCTOR_NOT_FOUND',
      });
    });
  });

  describe('삭제', () => {
    it('다른 강사를 삭제하면 목록에서 사라지고, 그 아이디는 다시 쓸 수 있다', async () => {
      const [admin] = await service.findAll();
      const t = await service.create(dto());
      await service.remove(t.id, admin.id);

      expect((await service.findAll()).map((i) => i.loginId)).toEqual([
        'admin',
      ]);
      // 행은 남아 있다 (Soft Delete)
      expect((await repo.findAll()).find((i) => i.id === t.id)!.deletedAt).toBe(
        NOW,
      );
      // 삭제된 아이디 재사용, 삭제된 강사는 수정·재삭제 불가
      await expect(service.create(dto())).resolves.toMatchObject({
        loginId: 'teacher1',
      });
      await expect(service.update(t.id, { name: 'x' })).rejects.toMatchObject({
        code: 'INSTRUCTOR_NOT_FOUND',
      });
      await expect(service.remove(t.id, admin.id)).rejects.toMatchObject({
        code: 'INSTRUCTOR_NOT_FOUND',
      });
    });

    it('자기 자신은 삭제할 수 없다', async () => {
      const [admin] = await service.findAll();
      await expect(service.remove(admin.id, admin.id)).rejects.toMatchObject({
        code: 'CANNOT_DELETE_SELF',
      });
      expect(await service.findAll()).toHaveLength(1);
    });

    it('두 강사가 서로를 동시에 삭제해도 한 명은 남는다', async () => {
      const [admin] = await service.findAll();
      const t = await service.create(dto());

      const results = await Promise.allSettled([
        service.remove(t.id, admin.id), // admin 이 t 를 삭제
        service.remove(admin.id, t.id), // t 가 admin 을 삭제
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await service.findAll()).toHaveLength(1);
    });
  });
});
