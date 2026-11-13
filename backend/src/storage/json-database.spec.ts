import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonDatabase } from './json-database';
import { JsonRepository } from './json-repository';

interface Item {
  id: number;
  value: number;
}

describe('JsonDatabase', () => {
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

  it('트랜잭션 밖에서의 쓰기는 거부한다', async () => {
    await expect(repo.create({ value: 1 })).rejects.toThrow();
  });

  it('동시에 들어온 트랜잭션도 직렬 실행되어 값이 유실되지 않는다', async () => {
    const { id } = await db.transaction(() => repo.create({ value: 0 }));
    // 읽고 나서 쓰는 사이에 다른 작업이 끼어들면 값이 덮어써져 10이 되지 못한다.
    const increase = () =>
      db.transaction(async () => {
        const item = (await repo.findById(id))!;
        await new Promise((r) => setTimeout(r, 5));
        await repo.update({ ...item, value: item.value + 1 });
      });
    await Promise.all(Array.from({ length: 10 }, increase));
    expect((await repo.findById(id))!.value).toBe(10);
  });

  it('오류가 나면 해당 트랜잭션의 변경을 되돌린다', async () => {
    await expect(
      db.transaction(async () => {
        await repo.create({ value: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findAll()).toHaveLength(0);
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
