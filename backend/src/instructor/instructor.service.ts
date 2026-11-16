import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import { Clock } from '../common/clock.service';
import { Database } from '../storage/database';
import type { Repository } from '../storage/repository';
import { INSTRUCTOR_REPOSITORY, Instructor } from './instructor.entity';

// 처음 실행할 때 만들어 둘 강사 계정. 환경 변수로 바꿀 수 있다 (운영에서는 반드시 바꿀 것).
const DEFAULT_LOGIN_ID = 'admin';
const DEFAULT_PASSWORD = 'admin1234';
const DEFAULT_NAME = '원장';

@Injectable()
export class InstructorService implements OnModuleInit {
  constructor(
    @Inject(INSTRUCTOR_REPOSITORY)
    private readonly instructors: Repository<Instructor>,
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** 강사 계정이 하나도 없으면 기본 강사 계정을 만든다 (로그인이 있으므로 처음에 들어갈 계정이 필요하다). */
  async onModuleInit() {
    if ((await this.instructors.findAll()).length > 0) return;

    const loginId = process.env.INSTRUCTOR_ID ?? DEFAULT_LOGIN_ID;
    const password = process.env.INSTRUCTOR_PASSWORD ?? DEFAULT_PASSWORD;
    const passwordHash = await hashPassword(password);
    const now = this.clock.now().toISOString();
    await this.db.transaction(() =>
      this.instructors.create({
        loginId,
        passwordHash,
        name: DEFAULT_NAME,
        createdAt: now,
        updatedAt: now,
      }),
    );
    new Logger(InstructorService.name).log(
      `기본 강사 계정을 만들었습니다 (아이디: ${loginId}). 운영 전에 비밀번호를 바꾸세요.`,
    );
  }
}
