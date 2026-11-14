export type VisitStatus = 'ACTIVE' | 'CANCELLED';
export type VisitAction = 'CREATE' | 'UPDATE' | 'CANCEL';

/**
 * 방문 신청 (현재 상태). 학생 한 명이 자습실 하나에 대해 가지는 "현재의" 신청이다.
 * 수정·취소하면 이 행은 갱신되고, 변경 내역은 VisitHistory에 따로 쌓인다.
 */
export interface VisitReservation {
  id: number;
  /** 낙관적 락용 버전. 같은 신청을 동시에 수정·취소하는 충돌을 막는다. */
  version: number;
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
  /** 저장소 공통 필드. 이력은 추가만 하므로 항상 0 에서 바뀌지 않는다. */
  version: number;
  reservationId: number;
  roomId: number;
  studentId: number;
  action: VisitAction;
  beforeVisitAt: string | null;
  afterVisitAt: string | null;
  createdAt: string;
}

/** 이력 조회 응답용: 화면에서 누가 했는지 보이도록 학생 이름을 덧붙인다. */
export type VisitHistoryView = VisitHistory & { studentName: string | null };

/** 내 신청 목록 응답용: 자습실 이름을 덧붙인다. */
export type VisitView = VisitReservation & { roomName: string | null };

export const VISIT_COLLECTION = 'visitReservations';
export const VISIT_HISTORY_COLLECTION = 'visitHistories';
export const VISIT_REPOSITORY = Symbol('VISIT_REPOSITORY');
export const VISIT_HISTORY_REPOSITORY = Symbol('VISIT_HISTORY_REPOSITORY');
