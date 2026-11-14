// 백엔드 응답 모양. 날짜는 모두 UTC ISO 8601 문자열이다.

export type Role = 'INSTRUCTOR' | 'STUDENT'
export type VisitStatus = 'ACTIVE' | 'CANCELLED'
export type VisitAction = 'CREATE' | 'UPDATE' | 'CANCEL'

export interface StudyRoom {
  id: number
  version: number
  name: string
  maxPersonnel: number
  /** 현재 신청 인원(취소 제외) */
  currentCount: number
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Student {
  id: number
  version: number
  name: string
  phone: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface VisitReservation {
  id: number
  version: number
  roomId: number
  studentId: number
  visitAt: string
  status: VisitStatus
  createdAt: string
  updatedAt: string
}

/** 내 신청 목록 한 줄 (자습실 이름 포함) */
export interface VisitView extends VisitReservation {
  roomName: string | null
}

export interface VisitHistory {
  id: number
  reservationId: number
  roomId: number
  studentId: number
  action: VisitAction
  beforeVisitAt: string | null
  afterVisitAt: string | null
  createdAt: string
  /** 학생 이름 (삭제된 학생이면 null일 수 있음) */
  studentName: string | null
}

/** 자습실 등록·수정 요청 */
export interface RoomPayload {
  name: string
  maxPersonnel: number
  startDate: string
  endDate: string
}
