import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import type { Repository } from '../storage/repository';
import { STUDENT_REPOSITORY, Student } from './student.entity';

const SEED_STUDENTS = [
  { name: '김민준', phone: '010-1111-0001' },
  { name: '이서연', phone: '010-1111-0002' },
  { name: '박지호', phone: '010-1111-0003' },
  { name: '최수아', phone: '010-1111-0004' },
  { name: '정도윤', phone: '010-1111-0005' },
];

@Injectable()
export class StudentService implements OnModuleInit {
  constructor(
    @Inject(STUDENT_REPOSITORY) private readonly students: Repository<Student>,
    private readonly db: JsonDatabase,
    private readonly clock: Clock,
  ) {}

  /** 로그인이 없는 MVP이므로, 학생이 한 명도 없으면 화면에서 고를 수 있게 예시 학생을 넣는다. */
  async onModuleInit() {
    if ((await this.students.findAll()).length > 0) return;
    const now = this.clock.now().toISOString();
    await this.db.transaction(async () => {
      for (const seed of SEED_STUDENTS) {
        await this.students.create({
          ...seed,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    });
  }

  /** 삭제된 학생은 제외한다. */
  findAll(): Promise<Student[]> {
    return this.students.findAll((s) => s.deletedAt === null);
  }
}
