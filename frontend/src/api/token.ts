// 로그인 토큰의 저장·조회. 새로고침해도 로그인이 유지되도록 localStorage 에 둔다.
// localStorage 는 막혀 있는 환경(시크릿 모드 등)이 있어서 실패해도 앱이 동작해야 한다 (그때는 메모리에만 보관).
const KEY = 'sr.token'
let memoryToken: string | null = null

export function getToken(): string | null {
  if (memoryToken) return memoryToken
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  memoryToken = token
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // 저장하지 못해도 이번 접속에서는 메모리에 보관한 값으로 계속 동작한다
  }
}

export function clearToken() {
  memoryToken = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 무시
  }
}

// 토큰이 만료되었거나 무효여서 서버가 401(UNAUTHORIZED)을 돌려주면 호출된다. (앱이 시작할 때 로그인 화면으로 보내는 동작을 등록한다)
let unauthorizedHandler: (() => void) | null = null
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}
export function notifyUnauthorized() {
  unauthorizedHandler?.()
}
