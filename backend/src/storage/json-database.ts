import { Injectable, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Mutex } from './mutex';

interface DbData {
  collections: Record<string, { id: number }[]>;
  sequences: Record<string, number>;
}

/**
 * JSON 파일 하나를 DB처럼 쓰게 해 주는 저장 엔진.
 * - 전체 데이터를 메모리에 들고 있고, 쓰기 트랜잭션이 끝날 때 파일에 저장한다.
 * - 쓰기 트랜잭션은 Mutex로 한 번에 하나만 실행된다 (정원 검사 + 저장이 끼어들기 없이 처리됨).
 * - 트랜잭션 중 오류가 나면 시작 시점으로 되돌린다 (rollback).
 */
@Injectable()
export class JsonDatabase implements OnModuleInit {
  private data: DbData = { collections: {}, sequences: {} };
  private readonly mutex = new Mutex();
  private readonly txContext = new AsyncLocalStorage<true>();

  constructor(private readonly filePath: string) {}

  async onModuleInit() {
    if (existsSync(this.filePath)) {
      this.data = JSON.parse(await readFile(this.filePath, 'utf8')) as DbData;
    } else {
      await this.persist();
    }
  }

  /** 쓰기 작업을 하나로 묶어 직렬 실행한다. 실패하면 메모리 상태를 원래대로 되돌린다. */
  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const snapshot = structuredClone(this.data);
      try {
        const result = await this.txContext.run(true, work);
        await this.persist();
        return result;
      } catch (error) {
        this.data = snapshot;
        throw error;
      }
    });
  }

  /** 트랜잭션 밖에서 쓰기를 시도하면 저장/잠금이 보장되지 않으므로 막는다. */
  assertInTransaction() {
    if (!this.txContext.getStore()) {
      throw new Error(
        '쓰기 작업은 JsonDatabase.transaction() 안에서만 가능합니다.',
      );
    }
  }

  collection<T extends { id: number }>(name: string): T[] {
    return (this.data.collections[name] ??= []) as T[];
  }

  nextId(name: string): number {
    const next = (this.data.sequences[name] ?? 0) + 1;
    this.data.sequences[name] = next;
    return next;
  }

  /** 임시 파일에 쓴 뒤 이름을 바꿔서, 저장 도중 꺼져도 파일이 깨지지 않게 한다. */
  private async persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(tmp, this.filePath);
  }
}
