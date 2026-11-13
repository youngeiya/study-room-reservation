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
import { ErrorCode } from './error-code';

/** 모든 예외를 {code, message, data} 형태로 변환한다 (Spring의 @ControllerAdvice 역할). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): {
    status: number;
    body: ApiResponse;
  } {
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
            data: r.message ?? null,
          },
        };
      }
      return {
        status,
        body: { code: `HTTP_${status}`, message: exception.message, data: null },
      };
    }

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
