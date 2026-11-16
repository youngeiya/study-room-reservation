import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import { Database } from '../storage/database';
import type { Repository } from '../storage/repository';
import { UniqueViolationError } from '../storage/unique-violation.error';
import { VISIT_REPOSITORY, VisitReservation } from '../visit/visit.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import {
  STUDENT_COLLECTION,
  STUDENT_REPOSITORY,
  Student,
  StudentView,
  toStudentView,
} from './student.entity';

// 처음 실행할 때 넣어 둘 예시 학생들
const SEED_STUDENTS = [
  {
    name: '김민준',
    phone: '010-1111-0001',
    studentNo: '2026001',
    grade: '고2',
    guardianPhone: '010-2222-0001',
  },
  {
    name: '이서연',
    phone: '010-1111-0002',
    studentNo: '2026002',
    grade: '고3',
    guardianPhone: '010-2222-0002',
  },
  {
    name: '박지호',
    phone: '010-1111-0003',
    studentNo: '2026003',
    grade: '고1',
    guardianPhone: '010-2222-0003',
  },
  {
    name: '최수아',
    phone: '010-1111-0004',
    studentNo: '2026004',
    grade: '중3',
    guardianPhone: '010-2222-0004',
  },
  {
    name: '정도윤',
    phone: '010-1111-0005',
    studentNo: '2026005',
    grade: 'N수',
    guardianPhone: null,
  },
];

// 선택 입력 정리: 안 보냈으면(undefined) 그대로 두고, 빈 문자열은 "없음(null)"으로, 문자열은 앞뒤 공백 제거
function normalizeOptional(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// @Injectable: Nest 의 DI 컨테이너가 관리하는 객체(Spring 의 @Service 에 해당)
@Injectable()
export class StudentService implements OnModuleInit {
  constructor(
    // Repository 는 인터페이스(타입일 뿐 런타임에는 없음)라서 @Inject(토큰) 으로 "어떤 구현체를 넣을지" 지정한다.
    // 실제 구현체는 student.module.ts 에서 연결한다.
    @Inject(STUDENT_REPOSITORY) private readonly students: Repository<Student>,
    // 학생을 삭제하거나 휴원·퇴원 처리할 때 "남아 있는 방문 신청이 있는지" 확인하려고 신청 저장소를 읽는다
    @Inject(VISIT_REPOSITORY)
    private readonly visits: Repository<VisitReservation>,
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    // "삭제되지 않은 학생끼리 학번은 유일" 이라는 제약을 저장소에 등록한다 (DB 의 부분 유니크 인덱스에 해당).
    // 서비스에서 먼저 확인해도 동시에 같은 학번으로 등록하는 두 요청은 막을 수 없어서, 커밋 때 한 번 더 검사한다.
    this.db.registerUnique(
      STUDENT_COLLECTION,
      'studentNo',
      (row) => (row as Student).deletedAt === null,
    );
  }

  /**
   * 학생이 한 명도 없으면 예시 학생을 넣는다. 예시 학생의 초기 비밀번호는 학번과 같다.
   * 이미 있는 데이터는 새 필드(재원 상태, 비밀번호)가 없으면 기본값으로 채운다.
   * onModuleInit: 앱이 뜰 때 Nest 가 자동으로 한 번 호출해 주는 훅.
   */
  async onModuleInit() {
    const all = await this.students.findAll();
    // new Date() 를 직접 쓰지 않고 Clock 을 통해 시각을 얻는다 (테스트에서 시각 고정 가능)
    const now = this.clock.now().toISOString();

    if (all.length === 0) {
      // 해시 계산은 느려서(일부러) 트랜잭션 밖에서 미리 한다. 재시도로 트랜잭션이 다시 실행돼도 다시 계산하지 않는다.
      const seeds = await Promise.all(
        SEED_STUDENTS.map(async (seed) => ({
          ...seed,
          passwordHash: await hashPassword(seed.studentNo),
        })),
      );
      // 쓰기는 반드시 트랜잭션 안에서. 5명을 한 덩어리로 저장한다 (중간에 실패하면 전부 취소).
      await this.db.transaction(async () => {
        for (const seed of seeds) {
          await this.students.create({
            ...seed,
            zipCode: null,
            address: null,
            addressDetail: null,
            memo: null,
            status: 'ENROLLED',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
        }
      });
      return;
    }

    // 이전 버전에서 저장된 학생을 새 형식에 맞춘다.
    //  - 재원 상태 등이 없으면 기본값으로, 학번은 알 수 없으므로 비워 둔다(null).
    //  - 비밀번호가 없는데 학번이 있으면 초기 비밀번호를 학번으로 정한다 (학번이 없으면 강사가 학번을 정해 줄 때까지 로그인 불가).
    const targets = all.filter(
      (s) =>
        (s as Partial<Student>).status === undefined ||
        (s as Partial<Student>).address === undefined ||
        (!s.passwordHash && !!s.studentNo),
    );
    if (targets.length > 0) {
      const hashes = new Map<number, string>();
      for (const s of targets) {
        if (!s.passwordHash && s.studentNo) {
          hashes.set(s.id, await hashPassword(s.studentNo));
        }
      }
      await this.db.transaction(async () => {
        for (const s of targets) {
          await this.students.update({
            ...s,
            studentNo: s.studentNo ?? null,
            passwordHash: hashes.get(s.id) ?? s.passwordHash ?? null,
            guardianPhone: s.guardianPhone ?? null,
            zipCode: s.zipCode ?? null,
            address: s.address ?? null,
            addressDetail: s.addressDetail ?? null,
            grade: s.grade ?? null,
            memo: s.memo ?? null,
            status: s.status ?? 'ENROLLED',
          });
        }
      });
    }
  }

  /** FR-STD-01 / FN-STD-01: 삭제된 학생은 제외한다. (조건: deletedAt 이 null 인 학생만) */
  async findAll(): Promise<StudentView[]> {
    const list = await this.students.findAll((s) => s.deletedAt === null);
    return list.map(toStudentView); // 비밀번호 해시는 내려보내지 않는다
  }

  /** FR-STD-02 / FN-STD-02: 학생 등록. 새 학생은 항상 재원(ENROLLED) 상태로 시작한다. */
  async create(dto: CreateStudentDto): Promise<StudentView> {
    const now = this.clock.now().toISOString();
    const studentNo = dto.studentNo.trim();
    // 초기 비밀번호: 강사가 정하지 않으면 학번과 같다
    const passwordHash = await hashPassword(dto.password ?? studentNo);
    const created = await this.guardUnique(() =>
      this.db.transaction(async () => {
        await this.assertStudentNoFree(studentNo);
        return this.students.create({
          name: dto.name.trim(),
          phone: dto.phone,
          studentNo,
          passwordHash,
          guardianPhone: normalizeOptional(dto.guardianPhone) ?? null,
          zipCode: normalizeOptional(dto.zipCode) ?? null,
          address: normalizeOptional(dto.address) ?? null,
          addressDetail: normalizeOptional(dto.addressDetail) ?? null,
          grade: normalizeOptional(dto.grade) ?? null,
          memo: normalizeOptional(dto.memo) ?? null,
          status: 'ENROLLED',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }),
    );
    return toStudentView(created);
  }

  /**
   * FR-STD-02: 학생 수정. 보낸 필드만 바꾸고, 삭제된 학생은 수정할 수 없다.
   * 재원 → 휴원·퇴원으로 바꾸려면 활성 신청이 없어야 한다 (삭제와 같은 원칙).
   */
  async update(id: number, dto: UpdateStudentDto): Promise<StudentView> {
    // 비밀번호를 바꾸는 경우에만 해시를 만든다 (느린 계산이라 트랜잭션 밖에서)
    const passwordHash =
      dto.password !== undefined ? await hashPassword(dto.password) : undefined;
    const updated = await this.guardUnique(() =>
      this.db.transaction(async () => {
        const student = await this.getActiveOrThrow(id);

        const studentNo = dto.studentNo?.trim();
        if (studentNo !== undefined && studentNo !== student.studentNo) {
          await this.assertStudentNoFree(studentNo, id);
        }
        const status = dto.status ?? student.status;
        if (student.status === 'ENROLLED' && status !== 'ENROLLED') {
          await this.assertNoActiveVisits(id);
        }

        const guardianPhone = normalizeOptional(dto.guardianPhone);
        const zipCode = normalizeOptional(dto.zipCode);
        const address = normalizeOptional(dto.address);
        const addressDetail = normalizeOptional(dto.addressDetail);
        const grade = normalizeOptional(dto.grade);
        const memo = normalizeOptional(dto.memo);
        return this.students.update({
          ...student,
          name: dto.name?.trim() ?? student.name,
          phone: dto.phone ?? student.phone,
          studentNo: studentNo ?? student.studentNo,
          passwordHash: passwordHash ?? student.passwordHash,
          guardianPhone:
            guardianPhone === undefined ? student.guardianPhone : guardianPhone,
          zipCode: zipCode === undefined ? (student.zipCode ?? null) : zipCode,
          address: address === undefined ? (student.address ?? null) : address,
          addressDetail:
            addressDetail === undefined
              ? (student.addressDetail ?? null)
              : addressDetail,
          grade: grade === undefined ? student.grade : grade,
          memo: memo === undefined ? student.memo : memo,
          status,
          updatedAt: this.clock.now().toISOString(),
        });
      }),
    );
    return toStudentView(updated);
  }

  /**
   * FR-STD-02: 학생 삭제 (Soft Delete).
   * 방문 신청이 남아 있으면(ACTIVE) 거부한다. 신청과 자습실 인원을 시스템이 임의로 바꾸지 않고,
   * 강사가 먼저 정리하도록 한다 (자습실 수정 때의 FR-ROM-06 과 같은 원칙).
   * 취소된 신청과 이력은 그대로 남고, 이력에는 삭제된 학생의 이름도 계속 보인다.
   *
   * 동시성: 같은 학생이 막 신청하는 요청과 부딪히면, 신청 쪽이 학생 행의 version 도 올리기 때문에
   * 한쪽이 충돌로 감지되어 다시 검사한다 (삭제 직후에 신청이 끼어들 수 없다).
   */
  remove(id: number): Promise<void> {
    return this.db.transaction(async () => {
      const student = await this.getActiveOrThrow(id);
      await this.assertNoActiveVisits(id);
      const now = this.clock.now().toISOString();
      await this.students.update({
        ...student,
        deletedAt: now,
        updatedAt: now,
      });
    });
  }

  // 수정·삭제는 "삭제되지 않은 학생"에게만 가능하다 (없거나 이미 삭제되었으면 404)
  private async getActiveOrThrow(id: number): Promise<Student> {
    const student = await this.students.findById(id);
    if (!student || student.deletedAt !== null) {
      throw new BusinessException('STUDENT_NOT_FOUND');
    }
    return student;
  }

  // 활성 신청이 남아 있으면 어떤 신청인지 알려 주며 거부한다
  private async assertNoActiveVisits(studentId: number) {
    const active = await this.visits.findAll(
      (v) => v.studentId === studentId && v.status === 'ACTIVE',
    );
    if (active.length > 0) {
      throw new BusinessException('STUDENT_HAS_ACTIVE_VISITS', {
        visitIds: active.map((v) => v.id),
      });
    }
  }

  // 삭제되지 않은 다른 학생이 같은 학번을 쓰고 있으면 거부한다 (삭제된 학생의 학번은 다시 쓸 수 있다)
  private async assertStudentNoFree(studentNo: string, exceptId?: number) {
    const same = await this.students.findAll(
      (s) =>
        s.deletedAt === null && s.studentNo === studentNo && s.id !== exceptId,
    );
    if (same.length > 0) throw new BusinessException('STUDENT_NO_DUPLICATED');
  }

  // 저장소의 유니크 제약 위반(동시에 같은 학번으로 등록)을 업무 오류로 바꾼다
  private async guardUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof UniqueViolationError &&
        error.field === 'studentNo'
      ) {
        throw new BusinessException('STUDENT_NO_DUPLICATED');
      }
      throw error;
    }
  }
}
