/**
 * 작업을 한 번에 하나씩, 들어온 순서대로 실행시키는 잠금.
 * 이전 작업이 끝난 Promise 뒤에 다음 작업을 이어 붙이는 방식이다.
 * 주의: 실행 중인 작업 안에서 다시 runExclusive를 부르면 자기 자신을 기다리는 교착이 생긴다.
 *
 * 동작 예시 (작업 A, B, C 가 거의 동시에 들어옴):
 *   tail(초기) → [A 실행] → [B 실행] → [C 실행]
 *   B 는 A 가 끝난 뒤에, C 는 B 가 끝난 뒤에 시작한다.
 *
 * Node.js 는 싱글 스레드지만 await 지점에서 다른 요청이 끼어들 수 있기 때문에
 * ("읽고 → await → 쓰기" 사이) 이런 직렬화가 필요하다.
 */
export class Mutex {
  // "지금까지 줄 선 작업 전체가 끝나는 시점"을 나타내는 Promise (줄의 맨 끝)
  private tail: Promise<unknown> = Promise.resolve();

  runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    // 줄의 맨 끝(tail)이 끝난 뒤에 내 작업(task)을 실행하도록 이어 붙인다.
    const result = this.tail.then(task);
    // 앞 작업이 실패해도 다음 작업은 계속 진행되어야 하므로 오류는 삼킨 Promise를 tail로 둔다.
    // (호출자에게 돌려주는 result 는 그대로라서, 실패는 호출자에게 정상적으로 전달된다)
    this.tail = result.catch(() => undefined);
    return result;
  }
}
