import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiResponse } from './api-response';
import { BusinessException } from './business.exception';
import { OptimisticLockError } from '../storage/optimistic-lock.error';
import { ErrorCode } from './error-code';

/**
 * 모든 예외를 {code, message, data} 형태로 변환한다 (Spring의 @ControllerAdvice 역할).
 *
 * 예외가 어디서 던져지든(컨트롤러, 서비스, ValidationPipe) 마지막에 이 필터를 거친다.
 * 그래서 클라이언트는 항상 같은 모양의 응답을 받는다.
 */
// @Catch() 에 인자가 없으면 "모든 종류의 예외"를 잡는다.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // host 에서 Express 의 응답 객체를 꺼낸다.
    const res = host.switchToHttp().getResponse<Response>();
    // 예외 종류에 따라 (HTTP 상태, 응답 본문)을 정한 뒤 JSON 으로 응답한다.
    const { status, body } = this.toResponse(exception);
    res.status(status).json(body);
  }

  // 예외 → (상태코드, 응답 본문) 변환. 위에서 아래로 "구체적인 것부터" 검사한다.
  private toResponse(exception: unknown): {
    status: number;
    body: ApiResponse;
  } {
    // 1) 우리가 서비스에서 던진 규칙 위반 (ROOM_FULL 등) → 정의해 둔 코드 그대로 응답
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        body: {
          code: exception.code,
          message: exception.message,
          data: exception.data,
        },
      };
    }

    // 1-2) 낙관적 락 충돌: 재시도를 다 써도 계속 다른 요청과 부딪힌 경우. 사용자가 다시 시도하면 된다 (409).
    if (exception instanceof OptimisticLockError) {
      return {
        status: ErrorCode.CONCURRENT_MODIFICATION.status,
        body: {
          code: 'CONCURRENT_MODIFICATION',
          message: ErrorCode.CONCURRENT_MODIFICATION.message,
          data: null,
        },
      };
    }

    // 2) NestJS 가 던지는 일반 HTTP 예외 (404, ValidationPipe 의 400 등)
    //    BusinessException 도 HttpException 을 상속하므로 반드시 1) 보다 뒤에 검사해야 한다.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // ValidationPipe 오류(400)는 상세 메시지 목록을 data로 내려준다.
      if (status === 400) {
        const r = exception.getResponse() as { message?: string | string[] };
        return {
          status,
          body: {
            code: 'VALIDATION_FAILED',
            message: ErrorCode.VALIDATION_FAILED.message,
            data: r.message ?? null, // 예: ["name should not be empty", ...]
          },
        };
      }
      // 그 외(404 등)는 상태코드로 코드명을 만든다. 예: HTTP_404
      return {
        status,
        body: {
          code: `HTTP_${status}`,
          message: exception.message,
          data: null,
        },
      };
    }

    // 3) 그 밖의 예상 못 한 오류(버그 등)
    //    내부 정보(스택 등)가 클라이언트에 새지 않도록 일반 메시지만 내려주고, 자세한 건 서버 로그에만 남긴다.
    this.logger.error(exception);
    return {
      status: ErrorCode.INTERNAL_ERROR.status,
      body: {
        code: 'INTERNAL_ERROR',
        message: ErrorCode.INTERNAL_ERROR.message,
        data: null,
      },
    };
  }
}
