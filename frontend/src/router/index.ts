import { createRouter, createWebHistory } from 'vue-router'
import type { Role } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { homeOf } from './home'
import InstructorLayout from '@/layouts/InstructorLayout.vue'
import StudentLayout from '@/layouts/StudentLayout.vue'
import LoginView from '@/views/LoginView.vue'
import RoomListView from '@/views/RoomListView.vue'

// 라우트에 "이 화면은 어떤 역할만 볼 수 있다 / 로그인 없이 볼 수 있다"는 표시를 달 수 있게 타입을 확장한다.
declare module 'vue-router' {
  interface RouteMeta {
    role?: Role
    public?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },

    // ── 강사 화면: 자습실·학생 관리 ──
    {
      path: '/instructor',
      component: InstructorLayout,
      meta: { role: 'INSTRUCTOR' },
      children: [
        { path: '', redirect: { name: 'instructor-rooms' } },
        { path: 'rooms', name: 'instructor-rooms', component: RoomListView },
        {
          path: 'rooms/:id',
          name: 'instructor-room-detail',
          component: () => import('@/views/RoomDetailView.vue'),
        },
        {
          path: 'students',
          name: 'instructor-students',
          component: () => import('@/views/StudentListView.vue'),
        },
      ],
    },

    // ── 학생 화면: 자습실 신청·내 신청 ──
    {
      path: '/student',
      component: StudentLayout,
      meta: { role: 'STUDENT' },
      children: [
        { path: '', redirect: { name: 'student-rooms' } },
        { path: 'rooms', name: 'student-rooms', component: RoomListView },
        {
          path: 'rooms/:id',
          name: 'student-room-detail',
          component: () => import('@/views/RoomDetailView.vue'),
        },
        {
          path: 'my-visits',
          name: 'student-my-visits',
          component: () => import('@/views/MyVisitsView.vue'),
        },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

/**
 * 화면 이동 가드 (사용자가 주소를 직접 쳐도 적용된다).
 *  - 로그인하지 않았으면 로그인 화면으로
 *  - 로그인했는데 로그인 화면으로 가면 내 역할의 첫 화면으로
 *  - 다른 역할의 화면(예: 학생이 /instructor/...)으로 가면 내 역할의 첫 화면으로
 * 이것은 "화면을 보여 줄지"만 정한다. 실제 보호는 서버가 한다 (서버가 모든 API 에서 역할을 다시 검사한다).
 */
router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.restore() // 새로고침 직후에는 저장된 토큰이 아직 유효한지 먼저 확인한다

  if (!session.user) {
    return to.meta.public ? true : { name: 'login' }
  }
  if (to.meta.public) return homeOf(session.user.role)

  const required = to.matched.find((r) => r.meta.role)?.meta.role
  if (required && required !== session.user.role) return homeOf(session.user.role)
})

export default router
