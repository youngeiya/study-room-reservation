import { JsonDatabase } from './json-database';
import { Repository } from './repository';

/** Repository의 JSON 파일 구현. 컬렉션 하나(예: 'students')를 담당한다. */
export class JsonRepository<T extends { id: number }> implements Repository<T> {
  constructor(
    private readonly db: JsonDatabase,
    private readonly name: string,
  ) {}

  // 내부 객체를 그대로 내주면 호출자가 update 없이 값을 바꿔 버릴 수 있어, 항상 복사본을 돌려준다.
  async findAll(predicate: (item: T) => boolean = () => true): Promise<T[]> {
    return structuredClone(this.db.collection<T>(this.name).filter(predicate));
  }

  async findById(id: number): Promise<T | null> {
    const found = this.db.collection<T>(this.name).find((i) => i.id === id);
    return found ? structuredClone(found) : null;
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    this.db.assertInTransaction();
    const entity = { ...data, id: this.db.nextId(this.name) } as T;
    this.db.collection<T>(this.name).push(entity);
    return structuredClone(entity);
  }

  async update(entity: T): Promise<T> {
    this.db.assertInTransaction();
    const list = this.db.collection<T>(this.name);
    const index = list.findIndex((i) => i.id === entity.id);
    if (index < 0) throw new Error(`${this.name}#${entity.id} 없음`);
    list[index] = structuredClone(entity);
    return structuredClone(entity);
  }
}
