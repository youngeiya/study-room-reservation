import type { BaseEntity, Repository } from './repository';

/** 트랜잭션 옵션. retries: 충돌(OptimisticLockError) 때 처음부터 다시 실행하는 횟수 */
export interface TransactionOptions {
  retries?: number;
}

/**
 * 저장 엔진의 계약. 서비스는 이 추상 클래스에만 의존하므로
 * JSON 파일(JsonDatabase)이든 Oracle(OracleDatabase)이든 서비스 코드는 그대로다.
 *
 * 추상 클래스로 만든 이유: 인터페이스는 컴파일하면 사라져서 Nest 의 의존성 주입 이름표로 쓸 수 없지만,
 * 추상 클래스는 런타임에도 남아서 그대로 주입 이름표가 된다.
 *
 * 공통 규칙
 * - 쓰기(create/update)는 transaction() 안에서만 가능하다.
 * - 같은 행을 그 사이 다른 요청이 바꿨다면(version 불일치) OptimisticLockError 가 나고,
 *   transaction() 이 work 를 처음부터 다시 실행한다. 그래서 work 는 여러 번 실행되어도 안전해야 한다.
 * - work 가 예외를 던지면 그 트랜잭션의 쓰기는 모두 취소(롤백)된다.
 */
export abstract class Database {
  abstract transaction<T>(
    work: () => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;

  /**
   * 컬렉션(테이블) 하나를 다루는 저장소를 만든다.
   * 모듈은 "어떤 저장 엔진인지" 모른 채 이 메서드로 저장소를 얻는다.
   */
  abstract repository<T extends BaseEntity>(collection: string): Repository<T>;

  /**
   * 유니크 제약을 등록한다. (예: 삭제되지 않은 학생끼리 학번은 유일)
   * JSON 구현은 커밋 때 직접 검사하고, Oracle 은 이미 DB 의 유니크 인덱스가 있어서 아무것도 하지 않는다.
   */
  abstract registerUnique(
    collection: string,
    field: string,
    appliesTo?: (row: BaseEntity) => boolean,
  ): void;
}
