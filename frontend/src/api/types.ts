// 백엔드 응답 모양. 날짜는 모두 UTC ISO 8601 문자열이다.

export type Role = 'INSTRUCTOR' | 'STUDENT'
export type VisitStatus = 'ACTIVE' | 'CANCELLED'
export type VisitAction = 'CREATE' | 'UPDATE' | 'CANCEL'

/** 자습실 소속 지점 코드 (H관 · S관 · 목동 · 반포) */
export type BranchCode = 'H' | 'S' | 'MOKDONG' | 'BANPO'

export interface StudyRoom {
  id: number
  version: number
  name: string
  /** 소속 지점 */
  branch: BranchCode
  maxPersonnel: number
  /** 현재 신청 인원(취소 제외) */
  currentCount: number
  /** 사진의 저장소 경로. 없으면 null (사진 주소는 roomImageUrl 로 만든다) */
  imageKey?: string | null
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 로그인한 사용자. 강사는 loginId 가 아이디, 학생은 학번이다. */
export interface AuthUser {
  role: Role
  id: number
  name: string
  loginId: string
}

export interface LoginResult {
  token: string
  user: AuthUser
}

/** 재원 상태: 재원 / 휴원 / 퇴원. 재원인 학생만 신청할 수 있다. */
export type StudentStatus = 'ENROLLED' | 'ON_LEAVE' | 'WITHDRAWN'

export interface Student {
  id: number
  version: number
  name: string
  phone: string
  /** 학번 (이전 데이터에는 없을 수 있음) */
  studentNo: string | null
  guardianPhone: string | null
  zipCode: string | null
  address: string | null
  addressDetail: string | null
  grade: string | null
  memo: string | null
  status: StudentStatus
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

/** 학생 등록·수정 요청 */
export interface StudentPayload {
  name: string
  phone: string
  studentNo: string
  /** 초기 비밀번호(등록) / 비밀번호 재설정(수정). 비우면 보내지 않는다 (등록 때는 학번이 초기 비밀번호) */
  password?: string
  /** 선택 값은 비우면 null 을 보낸다 (서버가 값을 비운다) */
  guardianPhone: string | null
  zipCode: string | null
  address: string | null
  addressDetail: string | null
  grade: string | null
  memo: string | null
  /** 수정할 때만 보낸다 (등록은 항상 재원) */
  status?: StudentStatus
}

/** 자습실 등록·수정 요청 */
export interface RoomPayload {
  name: string
  branch: BranchCode
  maxPersonnel: number
  startDate: string
  endDate: string
}

export type InstructorPosition =
  'DIRECTOR' | 'VICE_DIRECTOR' | 'HOMEROOM' | 'LECTURER' | 'ASSISTANT' | 'STAFF'
export type InstructorStatus = 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED'
export type Subject = 'KOREAN' | 'MATH' | 'ENGLISH' | 'SOCIAL' | 'SCIENCE' | 'KOREAN_HISTORY'

/** 강사 계정 (비밀번호는 내려오지 않는다) */
export interface Instructor {
  id: number
  version: number
  loginId: string
  name: string
  /** 사번 (이전 데이터에는 없을 수 있음) */
  employeeNo: string | null
  phone: string | null
  email: string | null
  position: InstructorPosition
  subjects: Subject[]
  /** 퇴직이면 로그인할 수 없다 */
  status: InstructorStatus
  /** 입사일 YYYY-MM-DD */
  hireDate: string | null
  memo: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 강사 등록·수정 요청. 수정할 때 password 는 비밀번호를 재설정할 때만, status 는 수정할 때만 보낸다. */
export interface InstructorPayload {
  loginId: string
  name: string
  password?: string
  employeeNo: string
  phone: string
  /** 선택 값은 비우면 null 을 보낸다 (서버가 값을 비운다) */
  email: string | null
  position: InstructorPosition
  subjects: Subject[]
  hireDate: string | null
  memo: string | null
  status?: InstructorStatus
}

/** 오늘(한국 시간) 방문하는 활성 신청 요약 (강사) */
export interface VisitSummary {
  date: string
  todayCount: number
}
