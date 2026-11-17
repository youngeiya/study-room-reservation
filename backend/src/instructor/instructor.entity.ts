/** 강사 계정. 로그인용 정보만 가진다 (자습실·학생 관리는 강사 역할이면 누구나 할 수 있다). */
export interface Instructor {
  id: number;
  /** 낙관적 락용 버전 (비밀번호 변경 등 수정될 때마다 +1) */
  version: number;
  /** 로그인 아이디. 삭제되지 않은 강사끼리는 중복될 수 없다. */
  loginId: string;
  /** 비밀번호 해시 (원문은 저장하지 않는다). 응답에 내려주지 않는다. */
  passwordHash: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Soft Delete. null 이면 삭제되지 않음. 이전 데이터에는 없을 수 있다(없으면 null 로 본다). */
  deletedAt: string | null;
}

/** API 응답용 강사. 비밀번호 해시는 절대 내려보내지 않는다. */
export type InstructorView = Omit<Instructor, 'passwordHash'>;

export function toInstructorView(instructor: Instructor): InstructorView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...view } = instructor;
  return { ...view, deletedAt: view.deletedAt ?? null };
}

/** 삭제되지 않은 강사인가 (이전 데이터처럼 deletedAt 이 없는 행도 "삭제 안 됨"으로 본다) */
export const isActiveInstructor = (i: Instructor) =>
  (i.deletedAt ?? null) === null;

export const INSTRUCTOR_COLLECTION = 'instructors';
export const INSTRUCTOR_REPOSITORY = Symbol('INSTRUCTOR_REPOSITORY');
