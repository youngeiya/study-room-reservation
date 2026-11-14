import { describe, expect, it } from 'vitest'
import { isoToLocalInput, localInputToIso } from '../datetime'

describe('datetime', () => {
  it('입력값 → ISO → 입력값으로 왕복해도 값이 그대로다 (실행 환경의 시간대와 무관)', () => {
    const input = '2026-11-20T09:30'
    expect(isoToLocalInput(localInputToIso(input))).toBe(input)
  })

  it('ISO 문자열은 UTC(Z)로 만들어진다', () => {
    expect(localInputToIso('2026-11-20T09:30')).toMatch(/^2026-11-\d\dT\d\d:30:00\.000Z$/)
  })
})
