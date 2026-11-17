import type { InstructorPosition, InstructorStatus, Subject } from '@/api/types'

// 강사 화면에서 쓰는 라벨·색 모음 (직책, 재직 상태, 담당 과목)
export const POSITION_LABEL: Record<InstructorPosition, string> = {
  DIRECTOR: '원장',
  VICE_DIRECTOR: '부원장',
  HOMEROOM: '담임강사',
  LECTURER: '강사',
  ASSISTANT: '조교',
  STAFF: '행정·상담',
}

export const STATUS_LABEL: Record<InstructorStatus, string> = {
  ACTIVE: '재직',
  ON_LEAVE: '휴직',
  RESIGNED: '퇴직',
}

export const STATUS_COLOR: Record<InstructorStatus, string> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  RESIGNED: 'grey',
}

export const SUBJECT_LABEL: Record<Subject, string> = {
  KOREAN: '국어',
  MATH: '수학',
  ENGLISH: '영어',
  SOCIAL: '사회탐구',
  SCIENCE: '과학탐구',
  KOREAN_HISTORY: '한국사',
}

const toItems = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, title: labels[value] }))

export const positionItems = toItems(POSITION_LABEL)
export const statusItems = toItems(STATUS_LABEL)
export const subjectItems = toItems(SUBJECT_LABEL)
