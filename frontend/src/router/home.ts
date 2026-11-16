import type { Role } from '@/api/types'

// 역할별 첫 화면. router/index.ts 와 LoginView 가 함께 쓰는데, 서로를 import 하는 순환이 생기지 않도록 별도 파일에 둔다.
export const homeOf = (role: Role) =>
  role === 'INSTRUCTOR' ? '/instructor/rooms' : '/student/rooms'
