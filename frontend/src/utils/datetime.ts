// 서버는 UTC ISO 문자열, 화면의 <input type="datetime-local"> 은 "내 시간대의 2026-11-20T09:00" 형식이다.
// 그 사이의 변환을 한곳에 모아 둔다.

const pad = (n: number) => String(n).padStart(2, '0')

/** datetime-local 입력값(내 시간대) → 서버로 보낼 UTC ISO 문자열 */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString()
}

/** 서버의 UTC ISO 문자열 → datetime-local 입력값(내 시간대) */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** 화면 표시용: 2026. 11. 20. 오전 9:00 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}
