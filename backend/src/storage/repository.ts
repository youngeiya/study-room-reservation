/** 모든 저장 대상이 가지는 공통 필드. version 은 낙관적 락에 쓰이며 저장소가 관리한다. */
export interface BaseEntity {
  id: number;
  version: number;
}

/**
 * 저장소 계약. 서비스는 이 인터페이스에만 의존하므로
 * JSON 파일 구현을 실제 DB 구현으로 바꿔도 서비스 코드는 바뀌지 않는다.
 *
 * - create: id 와 version(0)은 저장소가 채운다.
 * - update: 낙관적 락. entity.version 이 저장된 값과 같을 때만 반영되고 version 이 1 증가한다.
 *           다르면(그 사이 다른 요청이 수정) 커밋 시점에 OptimisticLockError.
 * - 삭제는 Soft Delete이므로 delete 메서드는 없고, deletedAt을 채워 update 한다.
 */
export interface Repository<T extends BaseEntity> {
  findAll(predicate?: (item: T) => boolean): Promise<T[]>;
  findById(id: number): Promise<T | null>;
  create(data: Omit<T, 'id' | 'version'>): Promise<T>;
  update(entity: T): Promise<T>;
}
