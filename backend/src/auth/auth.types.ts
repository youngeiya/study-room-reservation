/** 로그인할 수 있는 역할 */
export type Role = 'INSTRUCTOR' | 'STUDENT';

/** 로그인한 사용자. 토큰에 담겨 있다가 요청마다 꺼내 쓴다. */
export interface AuthUser {
  role: Role;
  id: number;
  name: string;
  /** 강사는 아이디, 학생은 학번 */
  loginId: string;
}
