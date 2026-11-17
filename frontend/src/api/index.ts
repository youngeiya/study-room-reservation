import { request } from './client'
import type {
  AuthUser,
  Instructor,
  InstructorPayload,
  LoginResult,
  Role,
  RoomPayload,
  Student,
  StudentPayload,
  StudyRoom,
  VisitHistory,
  VisitReservation,
  VisitSummary,
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
  // 오늘 신청 요약 (강사 전용, 상단바 현황)
  getVisitSummary: () => request<VisitSummary>('GET', '/visit-summary'),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<null>('PATCH', '/auth/password', body),

  // 자습실
  listRooms: () => request<StudyRoom[]>('GET', '/study-rooms'),
  getRoom: (id: number) => request<StudyRoom>('GET', `/study-rooms/${id}`),
  createRoom: (body: RoomPayload) => request<StudyRoom>('POST', '/study-rooms', body),
  updateRoom: (id: number, body: Partial<RoomPayload>) =>
    request<StudyRoom>('PATCH', `/study-rooms/${id}`, body),
  deleteRoom: (id: number) => request<null>('DELETE', `/study-rooms/${id}`),

  // 자습실 사진 (파일은 서버가 SeaweedFS 에 저장한다)
  uploadRoomImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<StudyRoom>('POST', `/study-rooms/${id}/image`, form)
  },
  deleteRoomImage: (id: number) => request<StudyRoom>('DELETE', `/study-rooms/${id}/image`),

  // 강사 계정 관리
  listInstructors: () => request<Instructor[]>('GET', '/instructors'),
  createInstructor: (body: InstructorPayload) => request<Instructor>('POST', '/instructors', body),
  updateInstructor: (id: number, body: Partial<InstructorPayload>) =>
    request<Instructor>('PATCH', `/instructors/${id}`, body),
  deleteInstructor: (id: number) => request<null>('DELETE', `/instructors/${id}`),

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
