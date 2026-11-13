/**
 * 저장소 계약. 서비스는 이 인터페이스에만 의존하므로
 * JSON 파일 구현을 실제 DB 구현으로 바꿔도 서비스 코드는 바뀌지 않는다.
 * 삭제는 Soft Delete이므로 delete 메서드는 없고, deletedAt을 채워 update 한다.
 */
export interface Repository<T extends { id: number }> {
  findAll(predicate?: (item: T) => boolean): Promise<T[]>;
  findById(id: number): Promise<T | null>;
  create(data: Omit<T, 'id'>): Promise<T>;
  update(entity: T): Promise<T>;
}
