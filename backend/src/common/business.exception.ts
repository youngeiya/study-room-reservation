import { HttpException } from '@nestjs/common';
import { ErrorCode, ErrorCodeName } from './error-code';

/** 서비스 규칙 위반을 나타내는 예외. 서비스 계층에서 던지고 필터가 {code, message, data}로 바꾼다. */
export class BusinessException extends HttpException {
  constructor(
    readonly code: ErrorCodeName,
    readonly data: unknown = null,
    message?: string,
  ) {
    super(message ?? ErrorCode[code].message, ErrorCode[code].status);
  }
}
