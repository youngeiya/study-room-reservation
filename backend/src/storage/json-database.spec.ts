import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonDatabase } from './json-database';
import { JsonRepository } from './json-repository';
import { OptimisticLockError } from './optimistic-lock.error';

interface Item {
  id: number;
  version: number;
  value: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('JsonDatabase (낙관적 락)', () => {
  let dir: string;
  let file: string;
  let db: JsonDatabase;
  let repo: JsonRepository<Item>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jsondb-'));
    file = join(dir, 'db.json');
    db = new JsonDatabase(file);
    await db.init();
    repo = new JsonRepository<Item>(db, 'items');
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  // 값을 읽고 → 잠시 쉬고(다른 요청이 끼어들 틈) → +1 해서 저장하는 트랜잭션
  const increase = (id: number, options?: { retries?: number }) =>
    db.transaction(async () => {
      const item = (await repo.findById(id))!;
      await sleep(5);
      await repo.update({ ...item, value: item.value + 1 });
    }, options);

  it('트랜잭션 밖에서의 쓰기는 거부한다', async () => {
    await expect(repo.create({ value: 1 })).rejects.toThrow();
  });

  it('새로 만든 행은 version 0 으로 시작하고, 수정될 때마다 1 씩 오른다', async () => {
    const created = await db.transaction(() => repo.create({ value: 1 }));
    expect(created.version).toBe(0);
    await increase(created.id);
    expect((await repo.findById(created.id))!.version).toBe(1);
  });

  it('동시에 같은 행을 수정하면 한 건만 성공하고 나머지는 충돌로 감지된다 (재시도 없음)', async () => {
    const { id } = await db.transaction(() => repo.create({ value: 0 }));
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => increase(id, { retries: 0 })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof OptimisticLockError,
    );
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(4);
    expect((await repo.findById(id))!.value).toBe(1);
  });

  it('충돌이 나면 처음부터 재시도해서, 동시 10건도 값이 유실되지 않는다', async () => {
    const { id } = await db.transaction(() => repo.create({ value: 0 }));
    await Promise.all(
      Array.from({ length: 10 }, () => increase(id, { retries: 30 })),
    );
    expect((await repo.findById(id))!.value).toBe(10);
  });

  it('오류가 나면 그 트랜잭션의 쓰기는 하나도 반영되지 않는다', async () => {
    await expect(
      db.transaction(async () => {
        await repo.create({ value: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findAll()).toHaveLength(0);
  });

  it('한 트랜잭션의 쓰기 중 하나라도 충돌하면 나머지도 반영되지 않는다 (원자성)', async () => {
    const a = await db.transaction(() => repo.create({ value: 1 }));
    const b = await db.transaction(() => repo.create({ value: 1 }));
    await expect(
      db.transaction(
        async () => {
          const [ia, ib] = [
            (await repo.findById(a.id))!,
            (await repo.findById(b.id))!,
          ];
          // 그 사이 b 를 다른 트랜잭션이 먼저 수정
          await increase(b.id, { retries: 0 });
          await repo.update({ ...ia, value: 100 });
          await repo.update({ ...ib, value: 200 }); // 낡은 version → 충돌
        },
        { retries: 0 },
      ),
    ).rejects.toBeInstanceOf(OptimisticLockError);
    expect((await repo.findById(a.id))!.value).toBe(1); // a 의 수정도 취소됨
  });

  it('커밋된 내용은 파일에 저장되고 다시 로드된다', async () => {
    await db.transaction(() => repo.create({ value: 7 }));
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.collections.items).toHaveLength(1);

    const reloaded = new JsonDatabase(file);
    await reloaded.init();
    const items = await new JsonRepository<Item>(reloaded, 'items').findAll();
    expect(items[0].value).toBe(7);
  });
});
