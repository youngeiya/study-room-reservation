export type VisitStatus = 'ACTIVE' | 'CANCELLED';
export type VisitAction = 'CREATE' | 'UPDATE' | 'CANCEL';

/**
 * 방문 신청 (현재 상태). 학생 한 명이 자습실 하나에 대해 가지는 "현재의" 신청이다.
 * 수정·취소하면 이 행은 갱신되고, 변경 내역은 VisitHistory에 따로 쌓인다.
 */
export interface VisitReservation {
  id: number;
  roomId: number;
  studentId: number;
  visitAt: string;
  status: VisitStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * 신청·수정·취소 이력. 추가만 하고 수정·삭제하지 않는다 (감사 로그).
 * 자습실 상세에서 바로 조회할 수 있도록 roomId, studentId를 함께 저장(비정규화)한다.
 */
export interface VisitHistory {
  id: number;
  reservationId: number;
  roomId: number;
  studentId: number;
  action: VisitAction;
  beforeVisitAt: string | null;
  afterVisitAt: string | null;
  createdAt: string;
}

export const VISIT_COLLECTION = 'visitReservations';
export const VISIT_HISTORY_COLLECTION = 'visitHistories';
export const VISIT_REPOSITORY = Symbol('VISIT_REPOSITORY');
export const VISIT_HISTORY_REPOSITORY = Symbol('VISIT_HISTORY_REPOSITORY');
