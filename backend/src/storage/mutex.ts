/**
 * 작업을 한 번에 하나씩, 들어온 순서대로 실행시키는 잠금.
 * 이전 작업이 끝난 Promise 뒤에 다음 작업을 이어 붙이는 방식이다.
 * 주의: 실행 중인 작업 안에서 다시 runExclusive를 부르면 자기 자신을 기다리는 교착이 생긴다.
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(task);
    // 앞 작업이 실패해도 다음 작업은 계속 진행되어야 하므로 오류는 삼킨 Promise를 tail로 둔다.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
