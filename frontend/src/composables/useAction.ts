import { ref } from 'vue'
import { describeError } from '@/api/client'

/**
 * 서버 호출 하나를 감싸서 "진행 중 표시 + 오류 문구"를 처리하는 도우미.
 * 사용: const { error, busy, run } = useAction()
 *       const result = await run(() => api.createRoom(payload))   // 실패하면 undefined, error 에 문구가 담긴다
 */
export function useAction() {
  const error = ref('')
  const busy = ref(false)

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    error.value = ''
    busy.value = true
    try {
      return await fn()
    } catch (e) {
      error.value = describeError(e)
      return undefined
    } finally {
      busy.value = false
    }
  }

  return { error, busy, run }
}
