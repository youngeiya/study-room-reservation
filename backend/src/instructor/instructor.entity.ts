/** 직책. 학원에서 흔히 쓰는 구분이다. */
export const INSTRUCTOR_POSITIONS = [
  'DIRECTOR', // 원장
  'VICE_DIRECTOR', // 부원장
  'HOMEROOM', // 담임강사
  'LECTURER', // 강사
  'ASSISTANT', // 조교
  'STAFF', // 행정·상담
] as const;
export type InstructorPosition = (typeof INSTRUCTOR_POSITIONS)[number];

/** 재직 상태. 퇴직이면 로그인할 수 없다 (계정을 지우는 대신 퇴직 처리하는 것이 실무 방식). */
export const INSTRUCTOR_STATUSES = ['ACTIVE', 'ON_LEAVE', 'RESIGNED'] as const;
export type InstructorStatus = (typeof INSTRUCTOR_STATUSES)[number];

/** 담당 과목 */
export const SUBJECTS = [
  'KOREAN', // 국어
  'MATH', // 수학
  'ENGLISH', // 영어
  'SOCIAL', // 사회탐구
  'SCIENCE', // 과학탐구
  'KOREAN_HISTORY', // 한국사
] as const;
export type Subject = (typeof SUBJECTS)[number];

/** 강사 계정. 로그인 정보와 인사·담당 정보를 함께 가진다 (자습실·학생 관리는 강사 역할이면 누구나 할 수 있다). */
export interface Instructor {
  id: number;
  /** 낙관적 락용 버전 (비밀번호 변경 등 수정될 때마다 +1) */
  version: number;
  /** 로그인 아이디. 삭제되지 않은 강사끼리는 중복될 수 없다. */
  loginId: string;
  /** 비밀번호 해시 (원문은 저장하지 않는다). 응답에 내려주지 않는다. */
  passwordHash: string;
  name: string;
  /** 사번(직원번호). 삭제되지 않은 강사끼리는 중복될 수 없다. 이전 데이터에는 없을 수 있다(null). */
  employeeNo: string | null;
  /** 휴대폰 번호 */
  phone: string | null;
  email: string | null;
  /** 직책 */
  position: InstructorPosition;
  /** 담당 과목. 저장은 쉼표로 이은 문자열("KOREAN,MATH")이고, API 에서는 배열로 다룬다. */
  subjects: string | null;
  /** 재직 상태. 퇴직이면 로그인 불가, 휴직은 로그인할 수 있다. */
  status: InstructorStatus;
  /** 입사일 (YYYY-MM-DD) */
  hireDate: string | null;
  /** 메모 (최대 200자) */
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  /** Soft Delete. null 이면 삭제되지 않음. 이전 데이터에는 없을 수 있다(없으면 null 로 본다). */
  deletedAt: string | null;
}

/** API 응답용 강사. 비밀번호 해시는 절대 내려보내지 않고, 담당 과목은 배열로 바꿔 준다. */
export type InstructorView = Omit<Instructor, 'passwordHash' | 'subjects'> & {
  subjects: Subject[];
};

/** 저장된 쉼표 문자열 → 배열 */
export function parseSubjects(csv: string | null | undefined): Subject[] {
  if (!csv) return [];
  return csv
    .split(',')
    .filter((s): s is Subject => (SUBJECTS as readonly string[]).includes(s));
}

/** 배열 → 저장용 쉼표 문자열 (중복 제거, 정해진 과목 순서로 정렬). 비어 있으면 null. */
export function joinSubjects(subjects: readonly string[] | undefined) {
  if (!subjects || subjects.length === 0) return null;
  const ordered = SUBJECTS.filter((s) => subjects.includes(s));
  return ordered.length > 0 ? ordered.join(',') : null;
}

export function toInstructorView(instructor: Instructor): InstructorView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, subjects, ...view } = instructor;
  return {
    ...view,
    // 이전 데이터에 없는 필드는 기본값으로 채워서 내려 준다
    employeeNo: view.employeeNo ?? null,
    phone: view.phone ?? null,
    email: view.email ?? null,
    position: view.position ?? 'LECTURER',
    status: view.status ?? 'ACTIVE',
    hireDate: view.hireDate ?? null,
    memo: view.memo ?? null,
    deletedAt: view.deletedAt ?? null,
    subjects: parseSubjects(subjects),
  };
}

/** 삭제되지 않은 강사인가 (이전 데이터처럼 deletedAt 이 없는 행도 "삭제 안 됨"으로 본다) */
export const isActiveInstructor = (i: Instructor) =>
  (i.deletedAt ?? null) === null;

/** 로그인할 수 있는 강사인가: 삭제되지 않았고 퇴직이 아니어야 한다 (휴직은 로그인 가능). */
export const canLogin = (i: Instructor) =>
  isActiveInstructor(i) && (i.status ?? 'ACTIVE') !== 'RESIGNED';

export const INSTRUCTOR_COLLECTION = 'instructors';
export const INSTRUCTOR_REPOSITORY = Symbol('INSTRUCTOR_REPOSITORY');
