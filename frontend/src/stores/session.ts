import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { clearToken, getToken, setToken } from '@/api/token'
import type { AuthUser, Role } from '@/api/types'

/**
 * "지금 누가 로그인해 있는가"를 담는 저장소.
 * 로그인하면 서버가 준 토큰을 저장하고(새로고침해도 유지), 화면이 열릴 때 서버에 토큰이 아직 유효한지 확인한다.
 * 강사/학생 구분과 학생 번호는 이 값(서버가 확인한 것)에서만 가져오고, 화면에서 임의로 바꿀 수 없다.
 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<AuthUser | null>(null)
  // 앱이 처음 열릴 때 토큰 확인(restore)이 끝났는지. 확인이 끝나기 전에는 로그인 여부를 판단하지 않는다.
  const restored = ref(false)
  let restoring: Promise<void> | null = null

  const isLoggedIn = computed(() => user.value !== null)
  const role = computed<Role | null>(() => user.value?.role ?? null)
  const isInstructor = computed(() => user.value?.role === 'INSTRUCTOR')
  const studentId = computed(() => (user.value?.role === 'STUDENT' ? user.value.id : null))

  /** 로그인. 틀리면 ApiError(INVALID_CREDENTIALS)가 던져진다. */
  async function login(roleToLogin: Role, loginId: string, password: string) {
    const result = await api.login({ role: roleToLogin, loginId: loginId.trim(), password })
    setToken(result.token)
    user.value = result.user
    restored.value = true
  }

  function logout() {
    clearToken()
    user.value = null
  }

  /** 저장된 토큰이 있으면 서버에 확인해서 로그인 상태를 되살린다 (한 번만 실행된다). */
  function restore(): Promise<void> {
    if (restoring) return restoring
    restoring = (async () => {
      if (getToken()) {
        try {
          user.value = await api.me()
        } catch {
          clearToken() // 만료되었거나 삭제된 계정이면 로그아웃 상태로 시작
          user.value = null
        }
      }
      restored.value = true
    })()
    return restoring
  }

  return { user, restored, isLoggedIn, role, isInstructor, studentId, login, logout, restore }
})
