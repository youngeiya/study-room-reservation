/** 강사 계정. 로그인용 정보만 가진다 (자습실·학생 관리는 강사 역할이면 누구나 할 수 있다). */
export interface Instructor {
  id: number;
  /** 낙관적 락용 버전 (비밀번호 변경 등 수정될 때마다 +1) */
  version: number;
  /** 로그인 아이디 (중복 불가) */
  loginId: string;
  /** 비밀번호 해시 (원문은 저장하지 않는다). 응답에 내려주지 않는다. */
  passwordHash: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const INSTRUCTOR_COLLECTION = 'instructors';
export const INSTRUCTOR_REPOSITORY = Symbol('INSTRUCTOR_REPOSITORY');
