import { ref } from 'vue'
import { ApiError, describeError } from '@/api/client'

/**
 * 서버 호출 하나를 감싸서 "진행 중 표시 + 오류 문구"를 처리하는 도우미.
 * 사용: const { error, errorCode, busy, run } = useAction()
 *       const result = await run(() => api.createRoom(payload))   // 실패하면 undefined, error 에 문구가 담긴다
 * errorCode 는 마지막 실패의 서버 에러 코드(예: 'ROOM_FULL'). 특정 오류만 따로 안내하고 싶을 때 쓴다.
 */
export function useAction() {
  const error = ref('')
  const errorCode = ref('')
  const busy = ref(false)

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    error.value = ''
    errorCode.value = ''
    busy.value = true
    try {
      return await fn()
    } catch (e) {
      error.value = describeError(e)
      errorCode.value = e instanceof ApiError ? e.code : ''
      return undefined
    } finally {
      busy.value = false
    }
  }

  return { error, errorCode, busy, run }
}
