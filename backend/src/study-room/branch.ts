/**
 * 부엉이 라이브러리 지점 코드. 자습실은 반드시 한 지점에 속한다.
 * 지점의 이름·주소·운영 시간 같은 "안내용 정보"는 화면의 설정(frontend/src/config/academy.ts)에 있고,
 * 서버는 자습실이 어느 지점인지(코드)만 알면 된다. 지점을 늘리려면 이 목록과 화면 설정을 함께 고친다.
 */
export const BRANCH_CODES = ['H', 'S', 'MOKDONG', 'BANPO'] as const;
export type BranchCode = (typeof BRANCH_CODES)[number];

/** 지점이 지정되지 않은 이전 자습실이 들어갈 기본 지점 */
export const DEFAULT_BRANCH: BranchCode = 'H';
