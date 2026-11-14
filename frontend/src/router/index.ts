import { createRouter, createWebHistory } from 'vue-router'
import type { Role } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import RoomListView from '@/views/RoomListView.vue'

// 라우트에 "이 화면은 어떤 역할만 볼 수 있다"는 표시를 달 수 있게 타입을 확장한다.
declare module 'vue-router' {
  interface RouteMeta {
    role?: Role
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'rooms', component: RoomListView },
    {
      path: '/rooms/:id',
      name: 'room-detail',
      component: () => import('@/views/RoomDetailView.vue'),
    },
    {
      path: '/students',
      name: 'students',
      component: () => import('@/views/StudentListView.vue'),
      meta: { role: 'INSTRUCTOR' },
    },
    {
      path: '/my-visits',
      name: 'my-visits',
      component: () => import('@/views/MyVisitsView.vue'),
      meta: { role: 'STUDENT' },
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'rooms' } },
  ],
})

// 역할이 맞지 않는 화면(예: 학생이 /students)으로 가면 목록으로 돌려보낸다.
router.beforeEach((to) => {
  const required = to.meta.role
  if (required && useSessionStore().role !== required) return { name: 'rooms' }
})

export default router
