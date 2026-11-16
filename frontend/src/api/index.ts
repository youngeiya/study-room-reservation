import { request } from './client'
import type {
  AuthUser,
  LoginResult,
  Role,
  RoomPayload,
  Student,
  StudentPayload,
  StudyRoom,
  VisitHistory,
  VisitReservation,
  VisitView,
} from './types'

/** 백엔드 엔드포인트 한 줄당 함수 하나. 화면은 URL 을 직접 알 필요가 없다. */
export const api = {
  // 로그인
  login: (body: { role: Role; loginId: string; password: string }) =>
    request<LoginResult>('POST', '/auth/login', body),
  me: () => request<AuthUser>('GET', '/auth/me'),
  // 예약 가능 기간(지금부터 며칠 이내). 날짜 입력 범위와 안내 문구에 쓴다.
  getBookingPolicy: () => request<{ maxDaysAhead: number }>('GET', '/booking-policy'),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<null>('PATCH', '/auth/password', body),

  // 자습실
  listRooms: () => request<StudyRoom[]>('GET', '/study-rooms'),
  getRoom: (id: number) => request<StudyRoom>('GET', `/study-rooms/${id}`),
  createRoom: (body: RoomPayload) => request<StudyRoom>('POST', '/study-rooms', body),
  updateRoom: (id: number, body: Partial<RoomPayload>) =>
    request<StudyRoom>('PATCH', `/study-rooms/${id}`, body),
  deleteRoom: (id: number) => request<null>('DELETE', `/study-rooms/${id}`),

  // 학생
  listStudents: () => request<Student[]>('GET', '/students'),
  createStudent: (body: StudentPayload) => request<Student>('POST', '/students', body),
  updateStudent: (id: number, body: Partial<StudentPayload>) =>
    request<Student>('PATCH', `/students/${id}`, body),
  deleteStudent: (id: number) => request<null>('DELETE', `/students/${id}`),

  // 방문 신청·이력 (신청하는 학생은 서버가 로그인 정보로 알아내므로 보내지 않는다)
  createVisit: (roomId: number, body: { visitAt: string }) =>
    request<VisitReservation>('POST', `/study-rooms/${roomId}/visits`, body),
  updateVisit: (id: number, body: { visitAt: string }) =>
    request<VisitReservation>('PATCH', `/visits/${id}`, body),
  cancelVisit: (id: number) => request<VisitReservation>('POST', `/visits/${id}/cancel`),
  listHistories: (roomId: number) =>
    request<VisitHistory[]>('GET', `/study-rooms/${roomId}/histories`),
  listStudentVisits: (studentId: number) =>
    request<VisitView[]>('GET', `/students/${studentId}/visits`),
}
