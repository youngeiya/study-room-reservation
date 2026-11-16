import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'

/**
 * 강사 화면(/instructor/...)과 학생 화면(/student/...)은 라우트 이름이 달라서,
 * 두 화면이 함께 쓰는 컴포넌트(자습실 목록·상세 등)가 "내 역할의 화면으로" 이동할 수 있게 이름을 골라 준다.
 */
export function useRouteNames() {
  const session = useSessionStore()
  return computed(() =>
    session.isInstructor
      ? { rooms: 'instructor-rooms', roomDetail: 'instructor-room-detail' }
      : { rooms: 'student-rooms', roomDetail: 'student-room-detail' },
  )
}
