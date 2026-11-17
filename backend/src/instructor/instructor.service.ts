import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { Database } from '../storage/database';
import type { Repository } from '../storage/repository';
import { UniqueViolationError } from '../storage/unique-violation.error';
import { CreateInstructorDto, UpdateInstructorDto } from './dto/instructor.dto';
import {
  INSTRUCTOR_COLLECTION,
  INSTRUCTOR_REPOSITORY,
  Instructor,
  InstructorView,
  isActiveInstructor,
  toInstructorView,
} from './instructor.entity';

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
  ) {
    // "삭제되지 않은 강사끼리 아이디는 유일" 제약을 저장소에 등록한다 (학생의 학번과 같은 방식).
    // 서비스에서 먼저 확인해도 동시에 같은 아이디로 등록하는 두 요청은 막을 수 없어서 커밋 때 한 번 더 검사한다.
    this.db.registerUnique(INSTRUCTOR_COLLECTION, 'loginId', (row) =>
      isActiveInstructor(row as Instructor),
    );
  }

  /**
   * 강사 계정이 하나도 없으면 기본 강사 계정을 만든다 (로그인이 있으므로 처음에 들어갈 계정이 필요하다).
   * 이미 있는 계정 중 삭제 표시(deletedAt)가 없는 이전 데이터는 null 로 채운다.
   */
  async onModuleInit() {
    const all = await this.instructors.findAll();
    if (all.length > 0) {
      const targets = all.filter(
        (i) => (i as Partial<Instructor>).deletedAt === undefined,
      );
      if (targets.length > 0) {
        await this.db.transaction(async () => {
          for (const i of targets) {
            await this.instructors.update({ ...i, deletedAt: null });
          }
        });
      }
      return;
    }

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
        deletedAt: null,
      }),
    );
    new Logger(InstructorService.name).log(
      `기본 강사 계정을 만들었습니다 (아이디: ${loginId}). 운영 전에 비밀번호를 바꾸세요.`,
    );
  }

  /** 강사 목록 (삭제된 강사는 제외). 비밀번호 해시는 내려보내지 않는다. */
  async findAll(): Promise<InstructorView[]> {
    const list = await this.instructors.findAll(isActiveInstructor);
    return list.map(toInstructorView);
  }

  /** 강사 등록 */
  async create(dto: CreateInstructorDto): Promise<InstructorView> {
    const loginId = dto.loginId.trim();
    const passwordHash = await hashPassword(dto.password); // 느린 계산은 트랜잭션 밖에서
    const now = this.clock.now().toISOString();
    const created = await this.guardUnique(() =>
      this.db.transaction(async () => {
        await this.assertLoginIdFree(loginId);
        return this.instructors.create({
          loginId,
          passwordHash,
          name: dto.name.trim(),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }),
    );
    return toInstructorView(created);
  }

  /** 강사 수정: 보낸 필드만 바꾼다. password 를 보내면 비밀번호를 재설정한다. */
  async update(id: number, dto: UpdateInstructorDto): Promise<InstructorView> {
    const passwordHash =
      dto.password !== undefined ? await hashPassword(dto.password) : undefined;
    const updated = await this.guardUnique(() =>
      this.db.transaction(async () => {
        const instructor = await this.getActiveOrThrow(id);
        const loginId = dto.loginId?.trim();
        if (loginId !== undefined && loginId !== instructor.loginId) {
          await this.assertLoginIdFree(loginId, id);
        }
        return this.instructors.update({
          ...instructor,
          loginId: loginId ?? instructor.loginId,
          name: dto.name?.trim() ?? instructor.name,
          passwordHash: passwordHash ?? instructor.passwordHash,
          updatedAt: this.clock.now().toISOString(),
        });
      }),
    );
    return toInstructorView(updated);
  }

  /**
   * 강사 삭제 (Soft Delete). 자기 자신은 삭제할 수 없다 (마지막 강사를 지워 아무도 로그인하지 못하는 상황 방지).
   *
   * 동시성: 두 강사가 서로를 동시에 삭제하면 각자 다른 행을 바꾸므로 충돌이 없어 둘 다 삭제될 수 있다.
   * 그래서 삭제를 요청한 강사(actor)의 행도 "건드려서" version 을 올린다. 한쪽이 충돌로 감지되어 다시 검사하고,
   * 다시 검사할 때는 이미 삭제된 강사의 요청이라 거부된다.
   */
  async remove(id: number, actorId: number): Promise<void> {
    if (id === actorId) {
      throw new BusinessException('CANNOT_DELETE_SELF');
    }
    await this.db.transaction(async () => {
      const actor = await this.instructors.findById(actorId);
      if (!actor || !isActiveInstructor(actor)) {
        throw new BusinessException('UNAUTHORIZED');
      }
      const target = await this.getActiveOrThrow(id);
      const now = this.clock.now().toISOString();
      await this.instructors.update({
        ...target,
        deletedAt: now,
        updatedAt: now,
      });
      await this.instructors.update(actor);
    });
  }

  // 수정·삭제는 "삭제되지 않은 강사"에게만 가능하다 (없거나 이미 삭제되었으면 404)
  private async getActiveOrThrow(id: number): Promise<Instructor> {
    const instructor = await this.instructors.findById(id);
    if (!instructor || !isActiveInstructor(instructor)) {
      throw new BusinessException('INSTRUCTOR_NOT_FOUND');
    }
    return instructor;
  }

  // 삭제되지 않은 다른 강사가 같은 아이디를 쓰고 있으면 거부한다 (삭제된 강사의 아이디는 다시 쓸 수 있다)
  private async assertLoginIdFree(loginId: string, exceptId?: number) {
    const same = await this.instructors.findAll(
      (i) =>
        isActiveInstructor(i) && i.loginId === loginId && i.id !== exceptId,
    );
    if (same.length > 0) {
      throw new BusinessException('INSTRUCTOR_LOGIN_ID_DUPLICATED');
    }
  }

  // 저장소의 유니크 제약 위반(동시에 같은 아이디로 등록)을 업무 오류로 바꾼다
  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof UniqueViolationError && error.field === 'loginId') {
        throw new BusinessException('INSTRUCTOR_LOGIN_ID_DUPLICATED');
      }
      throw error;
    }
  }
}
