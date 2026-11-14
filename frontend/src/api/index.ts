import { request } from './client'
import type {
  RoomPayload,
  Student,
  StudyRoom,
  VisitHistory,
  VisitReservation,
  VisitView,
} from './types'

/** 백엔드 엔드포인트 한 줄당 함수 하나. 화면은 URL 을 직접 알 필요가 없다. */
export const api = {
  // 자습실
  listRooms: () => request<StudyRoom[]>('GET', '/study-rooms'),
  getRoom: (id: number) => request<StudyRoom>('GET', `/study-rooms/${id}`),
  createRoom: (body: RoomPayload) => request<StudyRoom>('POST', '/study-rooms', body),
  updateRoom: (id: number, body: Partial<RoomPayload>) =>
    request<StudyRoom>('PATCH', `/study-rooms/${id}`, body),
  deleteRoom: (id: number) => request<null>('DELETE', `/study-rooms/${id}`),

  // 학생
  listStudents: () => request<Student[]>('GET', '/students'),

  // 방문 신청·이력
  createVisit: (roomId: number, body: { studentId: number; visitAt: string }) =>
    request<VisitReservation>('POST', `/study-rooms/${roomId}/visits`, body),
  updateVisit: (id: number, body: { studentId: number; visitAt: string }) =>
    request<VisitReservation>('PATCH', `/visits/${id}`, body),
  cancelVisit: (id: number, studentId: number) =>
    request<VisitReservation>('POST', `/visits/${id}/cancel`, { studentId }),
  listHistories: (roomId: number) =>
    request<VisitHistory[]>('GET', `/study-rooms/${roomId}/histories`),
  listStudentVisits: (studentId: number) =>
    request<VisitView[]>('GET', `/students/${studentId}/visits`),
}
