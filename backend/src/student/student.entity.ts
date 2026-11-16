/** 재원 상태. 재원(ENROLLED)인 학생만 방문을 신청할 수 있다. */
export const STUDENT_STATUSES = ['ENROLLED', 'ON_LEAVE', 'WITHDRAWN'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** 날짜는 JSON에 그대로 저장되도록 ISO 8601 문자열로 다룬다. */
export interface Student {
  id: number;
  /** 낙관적 락용 버전. 저장소가 관리한다 (수정될 때마다 +1). */
  version: number;
  name: string;
  phone: string;
  /** 학번(수강번호). 삭제되지 않은 학생끼리는 중복될 수 없다. 이전 데이터에는 없을 수 있다(null). */
  studentNo: string | null;
  /** 학부모 연락처 (선택) */
  guardianPhone: string | null;
  /** 학년 (선택). 예) 고2 */
  grade: string | null;
  /** 강사 메모 (선택, 최대 200자) */
  memo: string | null;
  /** 재원 상태. 실무에서는 학생을 지우는 대신 "퇴원"으로 다룬다. */
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const STUDENT_COLLECTION = 'students';
export const STUDENT_REPOSITORY = Symbol('STUDENT_REPOSITORY');
