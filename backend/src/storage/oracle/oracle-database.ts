import { Logger, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import oracledb from 'oracledb';
import { Database, TransactionOptions } from '../database';
import { OptimisticLockError } from '../optimistic-lock.error';
import type { BaseEntity, Repository } from '../repository';
import { OracleRepository } from './oracle-repository';
import { tableSpecOf } from './oracle-mappings';

export interface OracleConfig {
  user: string;
  password: string;
  /** 예) host:1521/FREEPDB1 */
  connectString: string;
  poolMax?: number;
}

// 충돌 시 재시도 횟수의 기본값 (첫 시도 + 재시도 5회) - JSON 구현과 같다
const DEFAULT_RETRIES = 5;
// ORA-00060: 교착 상태(deadlock). 한쪽이 취소되므로 처음부터 다시 실행하면 된다.
const ORA_DEADLOCK = 60;

interface TxContext {
  conn: oracledb.Connection;
}

/**
 * Oracle 저장 엔진 (연결 풀 + 트랜잭션).
 *
 * JSON 구현과 똑같은 계약을 지킨다.
 * - transaction(work): 풀에서 연결 하나를 빌려 work 를 실행하고, 성공하면 COMMIT, 예외면 ROLLBACK 한다.
 * - 충돌(OptimisticLockError)이나 교착 상태면 연결을 반납하고 처음부터 다시 실행한다 (기본 5회, 조금씩 다르게 쉬었다가).
 *   그래서 work 는 여러 번 실행되어도 안전해야 한다 (필요한 값을 매번 새로 읽고 판단한다).
 *
 * 차이점: JSON 구현은 쓰기를 모아 두었다가 커밋 때 한꺼번에 version 을 검사하지만,
 * Oracle 은 `UPDATE ... WHERE version = ?` 가 곧 검사다. 다른 요청이 같은 행을 수정 중이면 Oracle 의 행 잠금이
 * 끝날 때까지 기다려 주고, 끝난 뒤에는 version 이 달라져 0 행이 영향받아 충돌로 처리된다.
 * 여러 서버가 같은 DB 를 써도 정합성이 지켜진다 (프로세스 안의 잠금에 기대지 않는다).
 */
export class OracleDatabase extends Database implements OnModuleDestroy {
  private readonly logger = new Logger(OracleDatabase.name);
  // "지금 실행 중인 코드가 어느 트랜잭션(연결) 안인가"를 비동기 흐름 따라 기억한다
  private readonly txContext = new AsyncLocalStorage<TxContext>();

  private constructor(private readonly pool: oracledb.Pool) {
    super();
  }

  /** 연결 풀을 만들고 접속이 되는지 확인한 뒤 돌려준다 (앱이 뜰 때 한 번). */
  static async connect(config: OracleConfig): Promise<OracleDatabase> {
    const pool = await oracledb.createPool({
      user: config.user,
      password: config.password,
      connectString: config.connectString,
      poolMin: 1,
      poolMax: config.poolMax ?? 10,
      poolIncrement: 1,
    });
    const db = new OracleDatabase(pool);
    await db.query('SELECT 1 FROM dual'); // 접속 확인: 틀렸으면 여기서 바로 실패한다
    db.logger.log(`Oracle 연결: ${config.user}@${config.connectString}`);
    return db;
  }

  async onModuleDestroy() {
    await this.pool.close(5);
  }

  repository<T extends BaseEntity>(collection: string): Repository<T> {
    return new OracleRepository<T>(this, tableSpecOf(collection));
  }

  // 유니크 제약은 DB 의 유니크 인덱스(db/oracle/02_schema.sql)가 이미 지켜 주므로 등록할 것이 없다.
  registerUnique(): void {
    // no-op
  }

  async transaction<T>(
    work: () => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const maxRetries = options.retries ?? DEFAULT_RETRIES;
    for (let attempt = 0; ; attempt++) {
      const conn = await this.pool.getConnection();
      try {
        // work 를 "이 트랜잭션 안" 표시를 달고 실행 → repository 가 이 연결로 SQL 을 실행한다
        const result = await this.txContext.run({ conn }, work);
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback().catch(() => undefined); // 실패하면 이번 시도의 쓰기를 모두 취소
        if (!this.isRetryable(error) || attempt >= maxRetries) throw error;
        // 동시에 충돌한 요청들이 같은 순간에 다시 부딪히지 않도록 조금씩 다르게 쉬었다 재시도
        await new Promise((r) =>
          setTimeout(r, Math.random() * 10 * (attempt + 1)),
        );
      } finally {
        await conn.close(); // 풀에 반납
      }
    }
  }

  /** 트랜잭션 안이면 그 연결로, 밖이면 풀에서 잠깐 빌려서 조회한다. */
  async query(
    sql: string,
    binds: Record<string, unknown> = {},
  ): Promise<unknown[][]> {
    const options = { outFormat: oracledb.OUT_FORMAT_ARRAY };
    const ctx = this.txContext.getStore();
    if (ctx) {
      return (
        (
          await ctx.conn.execute<unknown[]>(
            sql,
            binds as oracledb.BindParameters,
            options,
          )
        ).rows ?? []
      );
    }
    const conn = await this.pool.getConnection();
    try {
      return (
        (
          await conn.execute<unknown[]>(
            sql,
            binds as oracledb.BindParameters,
            options,
          )
        ).rows ?? []
      );
    } finally {
      await conn.close();
    }
  }

  /** 쓰기는 트랜잭션 안에서만 가능하다 (검사·재시도·롤백이 보장되지 않으므로). */
  requireConnection(): oracledb.Connection {
    const ctx = this.txContext.getStore();
    if (!ctx) {
      throw new Error(
        '쓰기 작업은 Database.transaction() 안에서만 가능합니다.',
      );
    }
    return ctx.conn;
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof OptimisticLockError ||
      (error as { errorNum?: number })?.errorNum === ORA_DEADLOCK
    );
  }
}
