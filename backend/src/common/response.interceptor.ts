import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';

/**
 * 컨트롤러가 반환한 값을 {code:'OK', message, data}로 감싼다.
 * (Spring의 ResponseBodyAdvice 와 비슷). 그래서 컨트롤러는 포맷을 신경 쓰지 않고 값만 반환하면 된다.
 *
 * 흐름: 요청 → [Controller 실행] → 반환값 → (여기서 감싸기) → 클라이언트
 * 예외가 발생하면 이 인터셉터의 map 은 실행되지 않고 AllExceptionsFilter 로 넘어간다.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T | null>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T | null>> {
    // next.handle() = 컨트롤러 실행. 결과는 RxJS 의 Observable 로 오고,
    // pipe(map(...)) 으로 반환값을 가공한다. (Promise 의 .then 과 비슷한 역할)
    return next
      .handle()
      .pipe(
        // 반환값이 없으면(예: DELETE → void) undefined 대신 null 로 통일한다.
        map((data) => ({ code: 'OK', message: '성공', data: data ?? null })),
      );
  }
}
