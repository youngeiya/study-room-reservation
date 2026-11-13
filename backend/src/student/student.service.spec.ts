import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { STUDENT_COLLECTION, Student } from './student.entity';
import { StudentService } from './student.service';

describe('StudentService', () => {
  let dir: string;
  let db: JsonDatabase;
  let repo: JsonRepository<Student>;
  let service: StudentService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'student-'));
    db = new JsonDatabase(join(dir, 'db.json'));
    await db.init();
    repo = new JsonRepository<Student>(db, STUDENT_COLLECTION);
    service = new StudentService(repo, db, new Clock());
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('학생이 없으면 시드 학생을 넣고, 두 번 실행해도 중복되지 않는다', async () => {
    await service.onModuleInit();
    await service.onModuleInit();
    expect(await service.findAll()).toHaveLength(5);
  });

  it('삭제된 학생은 목록에서 제외한다', async () => {
    await service.onModuleInit();
    const [first] = await service.findAll();
    await db.transaction(() =>
      repo.update({ ...first, deletedAt: new Date().toISOString() }),
    );
    const list = await service.findAll();
    expect(list).toHaveLength(4);
    expect(list.find((s) => s.id === first.id)).toBeUndefined();
  });
});
