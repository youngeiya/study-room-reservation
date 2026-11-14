/** 백엔드가 항상 돌려주는 공통 응답: { code, message, data }. 성공이면 code 는 'OK'. */
interface ApiEnvelope<T> {
  code: string
  message: string
  data: T
}

/** 서버가 규칙 위반을 알려 온 경우(또는 연결 실패). code 로 종류를 구분한다. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data: unknown,
    readonly status: number,
  ) {
    super(message)
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/**
 * 모든 API 호출의 공통 통로. 응답의 { code, message, data } 를 벗겨서 data 만 돌려주고,
 * 실패하면 ApiError 를 던진다. 그래서 화면 코드는 성공 값만 다루고 실패는 catch 에서 한 번에 처리한다.
 */
export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해 주세요.',
      null,
      0,
    )
  }

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!res.ok || json === null || json.code !== 'OK') {
    throw new ApiError(
      json?.code ?? 'UNKNOWN',
      json?.message ?? '요청을 처리하지 못했습니다.',
      json?.data ?? null,
      res.status,
    )
  }
  return json.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 화면에 보여 줄 오류 문장. 서버가 data 로 준 부가 정보(영향받는 신청 번호 등)도 함께 붙인다. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return '알 수 없는 오류가 발생했습니다.'

  const { data } = error
  let detail = ''
  if (Array.isArray(data)) {
    detail = data.join(', ') // 입력 검증 오류 목록
  } else if (typeof data === 'string') {
    detail = data
  } else if (isRecord(data)) {
    if (Array.isArray(data.visitIds)) detail = `영향받는 신청 번호: ${data.visitIds.join(', ')}`
    else if (typeof data.currentCount === 'number')
      detail = `현재 신청 인원: ${data.currentCount}명`
  }
  return detail ? `${error.message} (${detail})` : error.message
}
