import type { Hall } from '@/config/academy'

// 운영 시간 계산. 시각은 항상 한국 시간(Asia/Seoul) 기준이다 (사용자 PC 의 시간대와 상관없이 같게 보이도록).

/** 한국 시간 기준 "지금"의 하루 중 분(0~1439) */
export function kstMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** "08:00~22:00" → [480, 1320]. 형식이 틀리거나 없으면 null */
export function parseHours(hours: string | null): [number, number] | null {
  const m = hours?.match(/^(\d{2}):(\d{2})~(\d{2}):(\d{2})$/)
  if (!m) return null
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])]
}

/** 지금 운영 중인가. 운영 시간 정보가 없으면 null (알 수 없음) */
export function isOpenNow(hall: Hall, now: Date = new Date()): boolean | null {
  const range = parseHours(hall.hours)
  if (!range) return null
  const minutes = kstMinutes(now)
  return minutes >= range[0] && minutes < range[1]
}

/** 화면에 보여 줄 운영 시간 문구. "00:00~24:00" 은 24시간 운영, 정보가 없으면 문의 안내 */
export function hoursLabel(hours: string | null): string {
  if (!hours) return '운영 시간은 문의해 주세요'
  if (hours === '00:00~24:00') return '매일 24시간 운영'
  return `매일 ${hours}`
}
