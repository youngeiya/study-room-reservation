import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import {
  INSTRUCTOR_REPOSITORY,
  Instructor,
} from '../instructor/instructor.entity';
import { Database } from '../storage/database';
import type { Repository } from '../storage/repository';
import { STUDENT_REPOSITORY, Student } from '../student/student.entity';
import type { AuthUser, Role } from './auth.types';
import { LoginAttemptService } from './login-attempt.service';
import { hashPassword, verifyPassword } from './password';
import { TokenService } from './token.service';

export interface LoginResult {
  token: string;
  user: AuthUser;
}

/**
 * 로그인·로그인 정보 확인·비밀번호 변경.
 *
 * 강사와 학생은 서로 다른 테이블(계정)이라서, 로그인할 때 "어느 쪽으로 로그인하는지"(역할)를 함께 받는다.
 * 같은 아이디가 강사에도 학생에도 있어도 섞이지 않는다.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(INSTRUCTOR_REPOSITORY)
    private readonly instructors: Repository<Instructor>,
    @Inject(STUDENT_REPOSITORY)
    private readonly students: Repository<Student>,
    private readonly tokens: TokenService,
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly attempts: LoginAttemptService,
  ) {}

  async login(
    role: Role,
    loginId: string,
    password: string,
  ): Promise<LoginResult> {
    // 이 계정이 잠겨 있으면 비밀번호를 확인하기 전에 거부한다 (무차별 대입 방어)
    this.attempts.assertNotLocked(role, loginId);

    const account = await this.findAccount(role, loginId.trim());
    // 계정이 없을 때도 같은 시간만큼 해시를 계산한다.
    // 응답 시간 차이로 "이 아이디는 존재한다"를 알아내는 것을 어렵게 하려는 것.
    const ok = account
      ? await verifyPassword(password, account.passwordHash)
      : (await hashPassword(password), false);
    // 아이디가 없는지 비밀번호가 틀렸는지 알려 주지 않는다 (같은 메시지)
    if (!account || !ok) {
      this.attempts.recordFailure(role, loginId); // 연속 실패를 센다 (없는 아이디도 똑같이)
      throw new BusinessException('INVALID_CREDENTIALS');
    }
    this.attempts.recordSuccess(role, loginId);

    const user = account.user;
    return { token: this.tokens.sign(user), user };
  }

  /**
   * 토큰의 사용자가 지금도 유효한지 확인하고 최신 정보를 돌려준다.
   * (로그인한 뒤 학생이 삭제되었거나 퇴원 처리되었으면 UNAUTHORIZED)
   */
  async me(current: AuthUser): Promise<AuthUser> {
    const account = await this.findById(current.role, current.id);
    if (!account) throw new BusinessException('UNAUTHORIZED');
    return account.user;
  }

  async changePassword(
    current: AuthUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.findById(current.role, current.id);
    if (!account) throw new BusinessException('UNAUTHORIZED');
    if (!(await verifyPassword(currentPassword, account.passwordHash))) {
      throw new BusinessException('WRONG_CURRENT_PASSWORD');
    }
    const passwordHash = await hashPassword(newPassword);
    const now = this.clock.now().toISOString();

    await this.db.transaction(async () => {
      // 읽은 뒤 다른 요청이 계정을 바꿨다면(낙관적 락 충돌) 처음부터 다시 읽고 수정한다
      if (current.role === 'INSTRUCTOR') {
        const row = await this.instructors.findById(current.id);
        if (!row) throw new BusinessException('UNAUTHORIZED');
        await this.instructors.update({ ...row, passwordHash, updatedAt: now });
      } else {
        const row = await this.students.findById(current.id);
        if (!row) throw new BusinessException('UNAUTHORIZED');
        await this.students.update({ ...row, passwordHash, updatedAt: now });
      }
    });
  }

  // ── 내부 도우미 ───────────────────────────────────────────────

  // 로그인 아이디(강사: loginId, 학생: 학번)로 계정을 찾는다
  private async findAccount(role: Role, loginId: string) {
    if (role === 'INSTRUCTOR') {
      const [row] = await this.instructors.findAll(
        (i) => i.loginId === loginId,
      );
      return row ? this.fromInstructor(row) : null;
    }
    const [row] = await this.students.findAll(
      (s) => s.deletedAt === null && s.studentNo === loginId,
    );
    return row ? this.fromStudent(row) : null;
  }

  private async findById(role: Role, id: number) {
    if (role === 'INSTRUCTOR') {
      const row = await this.instructors.findById(id);
      return row ? this.fromInstructor(row) : null;
    }
    const row = await this.students.findById(id);
    return row ? this.fromStudent(row) : null;
  }

  private fromInstructor(row: Instructor) {
    return {
      passwordHash: row.passwordHash as string | null,
      user: {
        role: 'INSTRUCTOR',
        id: row.id,
        name: row.name,
        loginId: row.loginId,
      } as AuthUser,
    };
  }

  // 삭제되었거나 퇴원 처리된 학생은 로그인할 수 없다. 휴원 학생은 로그인해서 볼 수는 있다 (신청만 막힌다).
  private fromStudent(row: Student) {
    if (
      row.deletedAt !== null ||
      row.status === 'WITHDRAWN' ||
      !row.studentNo
    ) {
      return null;
    }
    return {
      passwordHash: row.passwordHash,
      user: {
        role: 'STUDENT',
        id: row.id,
        name: row.name,
        loginId: row.studentNo,
      } as AuthUser,
    };
  }
}
