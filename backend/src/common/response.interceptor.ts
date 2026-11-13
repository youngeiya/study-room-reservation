import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from './api-response';

/** 컨트롤러가 반환한 값을 {code:'OK', message, data}로 감싼다. */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T | null>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T | null>> {
    return next
      .handle()
      .pipe(map((data) => ({ code: 'OK', message: '성공', data: data ?? null })));
  }
}
