/**
 * 유니크 제약을 어겼다는 신호 (DB 의 UNIQUE INDEX 위반과 같은 역할).
 * 저장소는 "어떤 업무 규칙인지" 모르므로 일반적인 오류로 던지고,
 * 서비스가 이를 받아 의미 있는 BusinessException 으로 바꾼다.
 */
export class UniqueViolationError extends Error {
  constructor(
    readonly collection: string,
    readonly field: string,
    readonly value: unknown,
  ) {
    super(`${collection}.${field} 값이 중복되었습니다: ${String(value)}`);
  }
}
