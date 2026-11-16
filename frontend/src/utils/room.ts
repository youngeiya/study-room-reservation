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

/**
 * 자습실 사진 주소. 사진이 없으면 null.
 * v 값(저장소 경로)은 사진을 바꾸면 달라지므로, 브라우저가 옛 사진을 캐시에서 꺼내 보여 주지 않는다.
 */
export function roomImageUrl(room: Pick<StudyRoom, 'id' | 'imageKey'>): string | null {
  if (!room.imageKey) return null
  return `/api/study-rooms/${room.id}/image?v=${encodeURIComponent(room.imageKey)}`
}
