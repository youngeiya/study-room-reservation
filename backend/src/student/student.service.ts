import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Clock } from '../common/clock.service';
import { JsonDatabase } from '../storage/json-database';
import type { Repository } from '../storage/repository';
import { STUDENT_REPOSITORY, Student } from './student.entity';

// 처음 실행할 때 넣어 둘 예시 학생들
const SEED_STUDENTS = [
  { name: '김민준', phone: '010-1111-0001' },
  { name: '이서연', phone: '010-1111-0002' },
  { name: '박지호', phone: '010-1111-0003' },
  { name: '최수아', phone: '010-1111-0004' },
  { name: '정도윤', phone: '010-1111-0005' },
];

// @Injectable: Nest 의 DI 컨테이너가 관리하는 객체(Spring 의 @Service 에 해당)
@Injectable()
export class StudentService implements OnModuleInit {
  constructor(
    // Repository 는 인터페이스(타입일 뿐 런타임에는 없음)라서 @Inject(토큰) 으로 "어떤 구현체를 넣을지" 지정한다.
    // 실제 구현체는 student.module.ts 에서 연결한다.
    @Inject(STUDENT_REPOSITORY) private readonly students: Repository<Student>,
    private readonly db: JsonDatabase,
    private readonly clock: Clock,
  ) {}

  /**
   * 로그인이 없는 MVP이므로, 학생이 한 명도 없으면 화면에서 고를 수 있게 예시 학생을 넣는다.
   * onModuleInit: 앱이 뜰 때 Nest 가 자동으로 한 번 호출해 주는 훅.
   */
  async onModuleInit() {
    // 이미 학생이 있으면 아무것도 하지 않는다 → 재시작해도 중복으로 들어가지 않는다
    if ((await this.students.findAll()).length > 0) return;
    // new Date() 를 직접 쓰지 않고 Clock 을 통해 시각을 얻는다 (테스트에서 시각 고정 가능)
    const now = this.clock.now().toISOString();
    // 쓰기는 반드시 트랜잭션 안에서. 5명을 한 덩어리로 저장한다 (중간에 실패하면 전부 취소).
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

  /** 삭제된 학생은 제외한다. (조건: deletedAt 이 null 인 학생만) */
  findAll(): Promise<Student[]> {
    return this.students.findAll((s) => s.deletedAt === null);
  }
}
