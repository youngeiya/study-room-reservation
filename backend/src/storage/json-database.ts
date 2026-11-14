import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Mutex } from './mutex';
import { OptimisticLockError } from './optimistic-lock.error';
import { BaseEntity } from './repository';

// db.json 파일의 모양.
// collections: 테이블 역할. 예) { studyRooms: [...], students: [...] }
// sequences:   테이블별 마지막 id (auto increment 역할). 예) { students: 5 }
interface DbData {
  collections: Record<string, BaseEntity[]>;
  sequences: Record<string, number>;
}

// 트랜잭션 안에서 "하려고 한 쓰기"를 모아 두는 항목. 커밋할 때까지 실제 데이터는 바뀌지 않는다.
type PendingWrite =
  | { kind: 'insert'; collection: string; row: BaseEntity }
  // update 의 row.version 은 "내가 읽었던 시점의 version" (기대값)
  | { kind: 'update'; collection: string; row: BaseEntity };

interface TxContext {
  writes: PendingWrite[];
}

// 충돌 시 재시도 횟수의 기본값 (첫 시도 + 재시도 5회)
const DEFAULT_RETRIES = 5;

/**
 * JSON 파일 하나를 DB처럼 쓰게 해 주는 저장 엔진 (낙관적 락 방식).
 *
 * 동작 요약
 * 1) 트랜잭션은 서로 기다리지 않고 동시에 실행된다 (잠금 없음).
 * 2) 트랜잭션 안의 쓰기는 바로 반영되지 않고 모아 둔다.
 * 3) 끝나는 시점(커밋)에 모아 둔 update 의 version 이 현재 저장된 값과 같은지 검사한다.
 *    - 모두 같으면 한 번에 적용하고 version 을 +1 한다.
 *    - 하나라도 다르면 다른 요청이 먼저 바꾼 것이므로 아무것도 적용하지 않고 처음부터 다시 실행한다 (재시도).
 * 4) 실패/예외 시에는 모아 둔 쓰기를 버리기만 하면 되므로 롤백이 따로 필요 없다.
 *
 * 한계: 메모리에 올린 데이터를 쓰는 구조라 이 구현은 서버 프로세스 1개에서만 동작한다.
 * 서버가 여러 대일 때는 Repository 구현체를 실제 DB로 교체한다 (version 검사는 SQL 의 WHERE version = ? 로 동일하게 동작).
 */
@Injectable()
export class JsonDatabase {
  // 커밋된 전체 데이터. 읽기는 여기서 바로 한다.
  private data: DbData = { collections: {}, sequences: {} };
  // 파일 저장(persist)만 한 번에 하나씩 하도록 줄 세운다. 업무 로직은 잠그지 않는다.
  private readonly writeMutex = new Mutex();
  // "지금 실행 중인 코드가 어느 트랜잭션 안인가"를 비동기 흐름 따라 기억한다 (자바의 ThreadLocal 과 비슷).
  private readonly txContext = new AsyncLocalStorage<TxContext>();

  // filePath 는 생성자 주입 대상이 아니라서 StorageModule 의 팩토리에서 직접 new 로 만든다.
  constructor(private readonly filePath: string) {}

  /** 파일을 읽어 메모리에 올린다. 모듈 훅 순서에 기대지 않도록 StorageModule 팩토리에서 await 한다. */
  async init() {
    if (existsSync(this.filePath)) {
      this.data = JSON.parse(await readFile(this.filePath, 'utf8')) as DbData;
    } else {
      await this.persist();
    }
  }

  /**
   * 쓰기 작업을 하나의 트랜잭션으로 실행한다. 충돌(OptimisticLockError)이 나면 work 를 처음부터 다시 실행한다.
   * 따라서 work 는 "여러 번 실행되어도 안전"해야 한다 (시작할 때 필요한 값을 다시 읽어서 판단하면 된다).
   * 사용법: await db.transaction(async () => { 읽기; 검사; repo.create(...); repo.update(...) })
   */
  async transaction<T>(
    work: () => Promise<T>,
    options: { retries?: number } = {},
  ): Promise<T> {
    const maxRetries = options.retries ?? DEFAULT_RETRIES;
    for (let attempt = 0; ; attempt++) {
      const ctx: TxContext = { writes: [] };
      try {
        // work 를 "이 트랜잭션 안" 표시를 달고 실행 → repo.create/update 가 ctx.writes 에 쌓인다
        const result = await this.txContext.run(ctx, work);
        if (ctx.writes.length > 0) {
          this.commit(ctx.writes); // 검사 + 적용 (동기, 중간에 끼어들 수 없음)
          await this.writeMutex.runExclusive(() => this.persist());
        }
        return result;
      } catch (error) {
        // 충돌이 아니거나, 재시도 횟수를 다 썼으면 그대로 던진다 (모아 둔 쓰기는 버려짐 = 롤백)
        if (!(error instanceof OptimisticLockError) || attempt >= maxRetries) {
          throw error;
        }
        // 동시에 충돌한 요청들이 같은 순간에 다시 부딪히지 않도록 조금씩 다르게 쉬었다 재시도
        await new Promise((r) =>
          setTimeout(r, Math.random() * 10 * (attempt + 1)),
        );
      }
    }
  }

  /**
   * 모아 둔 쓰기를 한 번에 검사·적용한다. await 가 없는 동기 함수이므로
   * 검사하고 적용하는 사이에 다른 요청이 끼어들 수 없다 (Node 는 싱글 스레드).
   * 복사본(draft)에 먼저 적용해 보고 전부 성공했을 때만 교체하므로, 중간에 실패해도 반쯤 적용되지 않는다.
   */
  private commit(writes: PendingWrite[]) {
    const draft = structuredClone(this.data);
    for (const w of writes) {
      const list = (draft.collections[w.collection] ??= []);
      if (w.kind === 'insert') {
        list.push(structuredClone(w.row));
        continue;
      }
      const index = list.findIndex((r) => r.id === w.row.id);
      if (index < 0) throw new Error(`${w.collection}#${w.row.id} 없음`);
      // 낙관적 락 검사: 내가 읽은 version 과 지금 저장된 version 이 같아야 한다
      if (list[index].version !== w.row.version) {
        throw new OptimisticLockError(w.collection, w.row.id);
      }
      list[index] = { ...structuredClone(w.row), version: w.row.version + 1 };
    }
    this.data = draft;
  }

  /** 커밋된 컬렉션(테이블)을 읽는다. 처음 쓰는 이름이면 빈 배열 (??= : 없을 때만 대입). */
  collection<T extends BaseEntity>(name: string): T[] {
    return (this.data.collections[name] ??= []) as T[];
  }

  /** 트랜잭션 안에서 INSERT 를 예약한다. id 는 지금 발급하고 version 은 0 으로 시작한다. */
  stageInsert<T extends BaseEntity>(
    name: string,
    data: Omit<T, 'id' | 'version'>,
  ): T {
    const ctx = this.requireTx();
    const row = { ...data, id: this.nextId(name), version: 0 } as unknown as T;
    ctx.writes.push({
      kind: 'insert',
      collection: name,
      row: structuredClone(row),
    });
    return structuredClone(row);
  }

  /** 트랜잭션 안에서 UPDATE 를 예약한다. entity.version 이 "기대 version" 이다. */
  stageUpdate<T extends BaseEntity>(name: string, entity: T): T {
    const ctx = this.requireTx();
    ctx.writes.push({
      kind: 'update',
      collection: name,
      row: structuredClone(entity),
    });
    // 호출자에게는 커밋되면 갖게 될 version(+1)을 미리 돌려준다.
    // 같은 트랜잭션에서 같은 행을 또 update 해도 이어서 검사가 통과하도록 하기 위함.
    return { ...structuredClone(entity), version: entity.version + 1 };
  }

  // 컬렉션별로 다음 id 를 발급한다 (1, 2, 3, ...). 실패한 트랜잭션이 쓴 번호는 건너뛴다 (DB 시퀀스와 같음).
  private nextId(name: string): number {
    const next = (this.data.sequences[name] ?? 0) + 1;
    this.data.sequences[name] = next;
    return next;
  }

  // 트랜잭션 밖에서 쓰기를 시도하면 막는다 (검사·재시도가 보장되지 않으므로).
  private requireTx(): TxContext {
    const ctx = this.txContext.getStore();
    if (!ctx) {
      throw new Error(
        '쓰기 작업은 JsonDatabase.transaction() 안에서만 가능합니다.',
      );
    }
    return ctx;
  }

  /** 임시 파일에 쓴 뒤 이름을 바꿔서, 저장 도중 꺼져도 파일이 깨지지 않게 한다. */
  private async persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    // 1) 임시 파일에 전부 쓴다 (이 도중에 꺼져도 원본 db.json 은 멀쩡하다)
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    // 2) 다 썼으면 이름을 바꿔 원본을 교체한다 (rename 은 사실상 한 번에 끝나는 동작)
    await rename(tmp, this.filePath);
  }
}
