import { JsonDatabase } from './json-database';
import { BaseEntity, Repository } from './repository';

/**
 * Repository의 JSON 파일 구현. 컬렉션 하나(예: 'students')를 담당한다.
 * 같은 클래스를 컬렉션 이름만 바꿔서 학생/자습실/신청마다 재사용한다 (제네릭 T).
 *
 * 읽기(find*)는 커밋된 데이터를 보여 준다. 같은 트랜잭션에서 방금 예약한 쓰기는 커밋 전까지 보이지 않는다.
 * 쓰기(create/update)는 트랜잭션 안에서만 가능하고, 커밋 시점에 version 검사를 거쳐 반영된다.
 */
export class JsonRepository<T extends BaseEntity> implements Repository<T> {
  constructor(
    private readonly db: JsonDatabase,
    private readonly name: string, // 컬렉션(테이블) 이름
  ) {}

  // 내부 객체를 그대로 내주면 호출자가 update 없이 값을 바꿔 버릴 수 있어, 항상 복사본을 돌려준다.
  // predicate 는 "조건 함수". 예) findAll(s => s.deletedAt === null)  (SQL 의 WHERE 와 비슷)
  async findAll(predicate: (item: T) => boolean = () => true): Promise<T[]> {
    return structuredClone(this.db.collection<T>(this.name).filter(predicate));
  }

  // 없으면 null (예외는 던지지 않는다. 없을 때 어떻게 할지는 서비스가 정한다)
  async findById(id: number): Promise<T | null> {
    const found = this.db.collection<T>(this.name).find((i) => i.id === id);
    return found ? structuredClone(found) : null;
  }

  // id(새로 발급)와 version(0)은 저장소가 채운다.
  async create(data: Omit<T, 'id' | 'version'>): Promise<T> {
    return this.db.stageInsert<T>(this.name, data);
  }

  // 낙관적 락: entity.version 이 저장된 값과 같을 때만 커밋된다.
  // (삭제 메서드가 없는 이유: 삭제는 deletedAt 을 채우는 update 로 처리)
  async update(entity: T): Promise<T> {
    return this.db.stageUpdate<T>(this.name, entity);
  }
}
