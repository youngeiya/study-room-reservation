/**
 * 선택 입력 정리: 안 보냈으면(undefined) 그대로 두고, 빈 문자열은 "없음(null)"으로, 문자열은 앞뒤 공백을 제거한다.
 * (수정 요청에서 "안 보낸 값은 유지, null 이나 빈 값은 비우기"를 구분하려는 것)
 */
export function normalizeOptional(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
