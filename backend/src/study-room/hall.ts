/**
 * 부엉이 라이브러리 관(건물) 코드. 자습실은 반드시 한 관에 속한다.
 * 관의 이름·주소·운영 시간 같은 "안내용 정보"는 화면의 설정(frontend/src/config/academy.ts)에 있고,
 * 서버는 자습실이 어느 관인지(코드)만 알면 된다. 관을 늘리려면 이 목록과 화면 설정, DB 제약을 함께 고친다.
 */
export const HALL_CODES = ['MAIN', 'ANNEX', 'EAST', 'WEST'] as const;
export type HallCode = (typeof HALL_CODES)[number];

/** 관이 지정되지 않은 이전 자습실이 들어갈 기본 관 (본관) */
export const DEFAULT_HALL: HallCode = 'MAIN';
