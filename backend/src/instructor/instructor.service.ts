import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { normalizeOptional } from '../common/normalize';
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
  joinSubjects,
  toInstructorView,
} from './instructor.entity';

// 처음 실행할 때 만들어 둘 강사 계정. 환경 변수로 바꿀 수 있다 (운영에서는 반드시 바꿀 것).
const DEFAULT_LOGIN_ID = 'admin';
const DEFAULT_PASSWORD = 'admin1234';
const DEFAULT_NAME = '원장';

// 처음 실행할 때 넣어 둘 예시 강사 (직책·담당 과목·재직 상태가 골고루 보이도록). 초기 비밀번호는 사번과 같다.
const SEED_INSTRUCTORS = [
  {
    loginId: 'kim.math',
    name: '김수학',
    employeeNo: 'T-001',
    phone: '010-2000-0001',
    email: 'kim.math@owl.example.com',
    position: 'HOMEROOM',
    subjects: ['MATH'],
    status: 'ACTIVE',
    hireDate: '2021-03-02',
    memo: '수학 담임. 월·수·금 오후 상담',
  },
  {
    loginId: 'lee.kor',
    name: '이국어',
    employeeNo: 'T-002',
    phone: '010-2000-0002',
    email: 'lee.kor@owl.example.com',
    position: 'LECTURER',
    subjects: ['KOREAN', 'KOREAN_HISTORY'],
    status: 'ACTIVE',
    hireDate: '2023-09-01',
    memo: null,
  },
  {
    loginId: 'park.eng',
    name: '박영어',
    employeeNo: 'T-003',
    phone: '010-2000-0003',
    email: null,
    position: 'LECTURER',
    subjects: ['ENGLISH'],
    status: 'ACTIVE',
    hireDate: '2022-03-15',
    memo: null,
  },
  {
    loginId: 'jung.sci',
    name: '정탐구',
    employeeNo: 'T-004',
    phone: '010-2000-0004',
    email: 'jung.sci@owl.example.com',
    position: 'LECTURER',
    subjects: ['SCIENCE', 'SOCIAL'],
    status: 'ON_LEAVE',
    hireDate: '2024-03-04',
    memo: '휴직 중 (이번 학기 복귀 예정)',
  },
  {
    loginId: 'choi.ta',
    name: '최조교',
    employeeNo: 'T-005',
    phone: '010-2000-0005',
    email: null,
    position: 'ASSISTANT',
    subjects: [],
    status: 'ACTIVE',
    hireDate: '2025-02-10',
    memo: null,
  },
  {
    loginId: 'han.staff',
    name: '한상담',
    employeeNo: 'T-006',
    phone: '010-2000-0006',
    email: 'han.staff@owl.example.com',
    position: 'STAFF',
    subjects: [],
    status: 'RESIGNED',
    hireDate: '2020-01-06',
    memo: '퇴직 (퇴직 처리 예시: 로그인할 수 없음)',
  },
] as const;

// 입사일이 형식(YYYY-MM-DD)뿐 아니라 실제로 있는 날짜인지 확인한다 (예: 2026-02-31 은 거부)
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

@Injectable()
export class InstructorService implements OnModuleInit {
  constructor(
    @Inject(INSTRUCTOR_REPOSITORY)
    private readonly instructors: Repository<Instructor>,
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    // "삭제되지 않은 강사끼리 아이디·사번은 유일" 제약을 저장소에 등록한다 (학생의 학번과 같은 방식).
    // 서비스에서 먼저 확인해도 동시에 같은 값으로 등록하는 두 요청은 막을 수 없어서 커밋 때 한 번 더 검사한다.
    for (const field of ['loginId', 'employeeNo']) {
      this.db.registerUnique(INSTRUCTOR_COLLECTION, field, (row) =>
        isActiveInstructor(row as Instructor),
      );
    }
  }

  /** 앱이 뜰 때: 기본 강사 계정(원장)을 보장하고, 처음 한 번만 예시 강사를 넣는다. */
  async onModuleInit() {
    await this.ensureDefaultAccount();
    await this.seedSamples();
  }

  /**
   * 예시 강사를 넣는다 (학생·자습실 시드와 같은 목적: 처음 실행해도 화면이 비어 보이지 않게).
   * "사번이 있는 강사가 한 명도 없을 때"(삭제된 강사 포함)만 넣으므로, 직접 등록했거나 예시를 지운 뒤에는
   * 재시작해도 다시 생기지 않는다. 예시 강사의 초기 비밀번호는 사번과 같다.
   * 환경 변수 SEED_SAMPLE_INSTRUCTORS=false 로 끌 수 있다 (테스트·실서비스용).
   */
  private async seedSamples() {
    if (process.env.SEED_SAMPLE_INSTRUCTORS === 'false') return;
    const all = await this.instructors.findAll();
    if (all.some((i) => (i.employeeNo ?? null) !== null)) return;

    // 해시 계산은 느려서(일부러) 트랜잭션 밖에서 미리 한다
    const seeds = await Promise.all(
      SEED_INSTRUCTORS.map(async (seed) => ({
        ...seed,
        passwordHash: await hashPassword(seed.employeeNo),
      })),
    );
    const now = this.clock.now().toISOString();
    await this.db.transaction(async () => {
      for (const { subjects, ...seed } of seeds) {
        await this.instructors.create({
          ...seed,
          subjects: joinSubjects(subjects),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    });
  }

  /**
   * 강사 계정이 하나도 없으면 기본 강사 계정(원장)을 만든다 (로그인이 있으므로 처음에 들어갈 계정이 필요하다).
   * 이미 있는 계정 중 새 필드(재직 상태 등)가 없는 이전 데이터는 기본값으로 채운다.
   */
  private async ensureDefaultAccount() {
    const all = await this.instructors.findAll();
    if (all.length > 0) {
      const targets = all.filter((i) => {
        const p = i as Partial<Instructor>;
        return (
          p.deletedAt === undefined ||
          p.status === undefined ||
          p.position === undefined ||
          p.employeeNo === undefined
        );
      });
      if (targets.length > 0) {
        await this.db.transaction(async () => {
          for (const i of targets) {
            await this.instructors.update({
              ...i,
              employeeNo: i.employeeNo ?? null,
              phone: i.phone ?? null,
              email: i.email ?? null,
              position: i.position ?? 'LECTURER',
              subjects: i.subjects ?? null,
              status: i.status ?? 'ACTIVE',
              hireDate: i.hireDate ?? null,
              memo: i.memo ?? null,
              deletedAt: i.deletedAt ?? null,
            });
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
        employeeNo: null,
        phone: null,
        email: null,
        position: 'DIRECTOR',
        subjects: null,
        status: 'ACTIVE',
        hireDate: null,
        memo: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
    new Logger(InstructorService.name).log(
      `기본 강사 계정을 만들었습니다 (아이디: ${loginId}). 운영 전에 비밀번호를 바꾸세요.`,
    );
  }

  /** 강사 목록 (삭제된 강사는 제외, 퇴직한 강사는 포함). 비밀번호 해시는 내려보내지 않는다. */
  async findAll(): Promise<InstructorView[]> {
    const list = await this.instructors.findAll(isActiveInstructor);
    return list.map(toInstructorView);
  }

  /** 강사 등록. 새 강사는 항상 재직(ACTIVE) 상태로 시작한다. */
  async create(dto: CreateInstructorDto): Promise<InstructorView> {
    const loginId = dto.loginId.trim();
    const employeeNo = dto.employeeNo.trim();
    const hireDate = normalizeOptional(dto.hireDate) ?? null;
    if (hireDate !== null && !isRealDate(hireDate)) {
      throw new BusinessException('INVALID_HIRE_DATE');
    }
    const passwordHash = await hashPassword(dto.password); // 느린 계산은 트랜잭션 밖에서
    const now = this.clock.now().toISOString();
    const created = await this.guardUnique(() =>
      this.db.transaction(async () => {
        await this.assertLoginIdFree(loginId);
        await this.assertEmployeeNoFree(employeeNo);
        return this.instructors.create({
          loginId,
          passwordHash,
          name: dto.name.trim(),
          employeeNo,
          phone: dto.phone,
          email: normalizeOptional(dto.email) ?? null,
          position: dto.position ?? 'LECTURER',
          subjects: joinSubjects(dto.subjects),
          status: 'ACTIVE',
          hireDate,
          memo: normalizeOptional(dto.memo) ?? null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }),
    );
    return toInstructorView(created);
  }

  /**
   * 강사 수정: 보낸 필드만 바꾼다. password 를 보내면 비밀번호를 재설정한다.
   * 자기 자신을 퇴직으로 바꿀 수는 없다 (아무도 로그인하지 못하는 상황 방지).
   * 다른 강사를 퇴직 처리할 때는 요청한 강사(actor)의 행도 "건드려서" 서로를 동시에 퇴직시키는 경우를 막는다
   * (삭제와 같은 이유, remove 참고).
   */
  async update(
    id: number,
    dto: UpdateInstructorDto,
    actorId: number,
  ): Promise<InstructorView> {
    if (dto.status === 'RESIGNED' && id === actorId) {
      throw new BusinessException('CANNOT_RESIGN_SELF');
    }
    const hireDate = normalizeOptional(dto.hireDate);
    if (typeof hireDate === 'string' && !isRealDate(hireDate)) {
      throw new BusinessException('INVALID_HIRE_DATE');
    }
    const passwordHash =
      dto.password !== undefined ? await hashPassword(dto.password) : undefined;

    const updated = await this.guardUnique(() =>
      this.db.transaction(async () => {
        const instructor = await this.getActiveOrThrow(id);

        const loginId = dto.loginId?.trim();
        if (loginId !== undefined && loginId !== instructor.loginId) {
          await this.assertLoginIdFree(loginId, id);
        }
        const employeeNo = dto.employeeNo?.trim();
        if (employeeNo !== undefined && employeeNo !== instructor.employeeNo) {
          await this.assertEmployeeNoFree(employeeNo, id);
        }
        if (dto.status === 'RESIGNED' && instructor.status !== 'RESIGNED') {
          await this.touchActor(actorId);
        }

        const email = normalizeOptional(dto.email);
        const memo = normalizeOptional(dto.memo);
        return this.instructors.update({
          ...instructor,
          loginId: loginId ?? instructor.loginId,
          passwordHash: passwordHash ?? instructor.passwordHash,
          name: dto.name?.trim() ?? instructor.name,
          employeeNo: employeeNo ?? instructor.employeeNo ?? null,
          phone: dto.phone ?? instructor.phone ?? null,
          email: email === undefined ? (instructor.email ?? null) : email,
          position: dto.position ?? instructor.position ?? 'LECTURER',
          subjects:
            dto.subjects === undefined
              ? (instructor.subjects ?? null)
              : joinSubjects(dto.subjects),
          status: dto.status ?? instructor.status ?? 'ACTIVE',
          hireDate:
            hireDate === undefined ? (instructor.hireDate ?? null) : hireDate,
          memo: memo === undefined ? (instructor.memo ?? null) : memo,
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
      await this.touchActor(actorId);
      const target = await this.getActiveOrThrow(id);
      const now = this.clock.now().toISOString();
      await this.instructors.update({
        ...target,
        deletedAt: now,
        updatedAt: now,
      });
    });
  }

  // 요청한 강사가 지금도 유효한지(삭제·퇴직되지 않았는지) 확인하고, 행을 갱신해서 version 을 올린다
  private async touchActor(actorId: number) {
    const actor = await this.instructors.findById(actorId);
    if (
      !actor ||
      !isActiveInstructor(actor) ||
      (actor.status ?? 'ACTIVE') === 'RESIGNED'
    ) {
      throw new BusinessException('UNAUTHORIZED');
    }
    await this.instructors.update(actor);
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

  // 사번도 삭제되지 않은 강사끼리 유일하다
  private async assertEmployeeNoFree(employeeNo: string, exceptId?: number) {
    const same = await this.instructors.findAll(
      (i) =>
        isActiveInstructor(i) &&
        i.employeeNo === employeeNo &&
        i.id !== exceptId,
    );
    if (same.length > 0) {
      throw new BusinessException('INSTRUCTOR_EMPLOYEE_NO_DUPLICATED');
    }
  }

  // 저장소의 유니크 제약 위반(동시에 같은 값으로 등록)을 업무 오류로 바꾼다
  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        if (error.field === 'loginId') {
          throw new BusinessException('INSTRUCTOR_LOGIN_ID_DUPLICATED');
        }
        if (error.field === 'employeeNo') {
          throw new BusinessException('INSTRUCTOR_EMPLOYEE_NO_DUPLICATED');
        }
      }
      throw error;
    }
  }
}
