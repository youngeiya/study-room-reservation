import type { StudyRoom } from '@/api/types'

type RoomCount = Pick<StudyRoom, 'currentCount' | 'maxPersonnel'>

/** 신청 인원 비율 (0~100). 진행 막대에 쓴다. */
export function occupancyPercent(room: RoomCount): number {
  if (room.maxPersonnel <= 0) return 0
  return Math.min(100, Math.round((room.currentCount / room.maxPersonnel) * 100))
}

export function isFull(room: RoomCount): boolean {
  return room.currentCount >= room.maxPersonnel
}

/** 꽉 찼으면 빨강, 80% 이상이면 주황, 그 외 초록 (Vuetify 색 이름) */
export function occupancyColor(room: RoomCount): 'error' | 'warning' | 'success' {
  if (isFull(room)) return 'error'
  return occupancyPercent(room) >= 80 ? 'warning' : 'success'
}
