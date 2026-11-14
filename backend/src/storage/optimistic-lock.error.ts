/**
 * 낙관적 락 충돌: 내가 읽은 뒤 다른 요청이 같은 행을 먼저 수정해서 version 이 달라졌다.
 * 저장소 계층의 오류이므로 common 의 BusinessException 과 분리하고, 예외 필터가 409 로 변환한다.
 * (실제 DB 구현에서는 "UPDATE ... WHERE id = ? AND version = ?" 가 0건 갱신될 때 이 오류를 던진다)
 */
export class OptimisticLockError extends Error {
  constructor(
    readonly collection: string,
    readonly id: number,
  ) {
    super(`${collection}#${id} 가 다른 요청에 의해 먼저 변경되었습니다.`);
  }
}
