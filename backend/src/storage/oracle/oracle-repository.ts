import oracledb from 'oracledb';
import { OptimisticLockError } from '../optimistic-lock.error';
import type { BaseEntity, Repository } from '../repository';
import { UniqueViolationError } from '../unique-violation.error';
import type { OracleDatabase } from './oracle-database';
import type { ColumnSpec, TableSpec } from './oracle-mappings';

// 시각은 UTC ISO 문자열(2026-11-20T00:00:00.000Z) ↔ TIMESTAMP(3) 로 오간다.
// JS Date 를 그대로 바인딩하면 Node 의 시간대가 끼어들 수 있어서, 문자열로 주고받고 DB 에서 형식 변환을 한다.
const TS_FORMAT = `YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"`;

/**
 * Repository 의 Oracle 구현. 테이블 하나를 담당한다 (매핑은 oracle-mappings.ts).
 *
 * - 읽기: 트랜잭션 안이면 그 연결로, 밖이면 풀에서 잠깐 빌려서 조회한다. predicate 는 JSON 구현과 똑같이
 *   조회한 뒤 JS 에서 걸러 낸다 (의미를 똑같이 유지하려는 선택. 데이터가 커지면 WHERE 로 내려야 한다).
 * - 쓰기: 트랜잭션 안에서 바로 SQL 을 실행한다. update 는 `WHERE id = :id AND version = :version` 이라서
 *   그 사이 다른 요청이 바꿨으면 0 행이 영향받고, 그때 OptimisticLockError 를 던진다.
 *   (다른 요청이 같은 행을 수정 중이면 Oracle 의 행 잠금 때문에 그 요청이 끝날 때까지 기다린 뒤 0 행이 된다.)
 */
export class OracleRepository<T extends BaseEntity> implements Repository<T> {
  constructor(
    private readonly db: OracleDatabase,
    private readonly spec: TableSpec,
  ) {}

  async findAll(predicate: (item: T) => boolean = () => true): Promise<T[]> {
    const rows = await this.db.query(`${this.selectSql()} ORDER BY id`);
    return rows.map((r) => this.toEntity(r)).filter(predicate);
  }

  async findById(id: number): Promise<T | null> {
    const rows = await this.db.query(`${this.selectSql()} WHERE id = :id`, {
      id,
    });
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async create(data: Omit<T, 'id' | 'version'>): Promise<T> {
    const conn = this.db.requireConnection();
    const cols = this.spec.columns;
    const sql =
      `INSERT INTO ${this.spec.table} (${cols.map((c) => c.column).join(', ')}) ` +
      `VALUES (${cols.map((c, i) => this.placeholder(c, `v${i}`)).join(', ')}) ` +
      `RETURNING id INTO :out_id`;
    const binds: Record<string, unknown> = {
      out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    };
    cols.forEach((c, i) => (binds[`v${i}`] = this.toBind(data, c)));
    try {
      const result = await conn.execute<unknown>(
        sql,
        binds as oracledb.BindParameters,
      );
      const id = (result.outBinds as { out_id: number[] }).out_id[0];
      return { ...data, id, version: 0 } as unknown as T;
    } catch (error) {
      throw this.translate(error, data as Record<string, unknown>);
    }
  }

  async update(entity: T): Promise<T> {
    if (!this.spec.versioned) {
      throw new Error(
        `${this.spec.table} 은(는) 추가만 하는 테이블이라 수정할 수 없습니다.`,
      );
    }
    const conn = this.db.requireConnection();
    const cols = this.spec.columns;
    const sql =
      `UPDATE ${this.spec.table} SET ` +
      cols
        .map((c, i) => `${c.column} = ${this.placeholder(c, `v${i}`)}`)
        .join(', ') +
      `, version = version + 1 WHERE id = :id AND version = :version`;
    const binds: Record<string, unknown> = {
      id: entity.id,
      version: entity.version,
    };
    cols.forEach((c, i) => (binds[`v${i}`] = this.toBind(entity, c)));
    try {
      const result = await conn.execute(sql, binds as oracledb.BindParameters);
      // 0 행 = 내가 읽은 뒤 다른 요청이 먼저 바꿨다 (낙관적 락 충돌)
      if (!result.rowsAffected) {
        throw new OptimisticLockError(this.spec.collection, entity.id);
      }
      return { ...entity, version: entity.version + 1 };
    } catch (error) {
      throw this.translate(error, entity as unknown as Record<string, unknown>);
    }
  }

  // ── 내부 도우미 ───────────────────────────────────────────────

  // id, [version], 각 컬럼 순서의 SELECT. 시각 컬럼은 UTC ISO 문자열로 바꿔서 가져온다.
  private selectSql(): string {
    const parts = ['id'];
    if (this.spec.versioned) parts.push('version');
    for (const c of this.spec.columns) {
      parts.push(
        c.type === 'timestamp'
          ? `TO_CHAR(${c.column}, '${TS_FORMAT}')`
          : c.column,
      );
    }
    return `SELECT ${parts.join(', ')} FROM ${this.spec.table}`;
  }

  private toEntity(row: unknown[]): T {
    const entity: Record<string, unknown> = { id: Number(row[0]) };
    let i = 1;
    entity.version = this.spec.versioned ? Number(row[i++]) : 0;
    for (const c of this.spec.columns) {
      const v = row[i++];
      entity[c.prop] =
        v === null || v === undefined
          ? null
          : c.type === 'number'
            ? Number(v)
            : v;
    }
    return entity as unknown as T;
  }

  private placeholder(c: ColumnSpec, bind: string): string {
    return c.type === 'timestamp'
      ? `TO_TIMESTAMP(:${bind}, '${TS_FORMAT}')`
      : `:${bind}`;
  }

  private toBind(source: unknown, c: ColumnSpec): unknown {
    const v = (source as Record<string, unknown>)[c.prop];
    return v === undefined ? null : v;
  }

  /**
   * Oracle 오류를 우리 쪽 오류로 바꾼다.
   * - 학번 유니크 위반: 업무 규칙이므로 UniqueViolationError (서비스가 STUDENT_NO_DUPLICATED 로 바꾼다)
   * - 그 밖의 유니크 위반(활성 신청 한 건 등): 같은 학생의 동시 요청과 부딪힌 것이므로 충돌로 보고 재시도
   */
  private translate(error: unknown, source: Record<string, unknown>): unknown {
    if (error instanceof OptimisticLockError) return error;
    const e = error as { errorNum?: number; message?: string };
    if (e?.errorNum === 1) {
      const message = (e.message ?? '').toUpperCase();
      for (const [constraint, prop] of Object.entries(this.spec.uniques)) {
        if (message.includes(constraint)) {
          return new UniqueViolationError(
            this.spec.collection,
            prop,
            source[prop],
          );
        }
      }
      return new OptimisticLockError(
        this.spec.collection,
        Number(source.id ?? 0),
      );
    }
    return error;
  }
}
