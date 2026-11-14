import { HttpException } from '@nestjs/common';
import { ErrorCode, ErrorCodeName } from './error-code';

/**
 * 서비스 규칙 위반을 나타내는 예외. 서비스 계층에서 던지고 필터가 {code, message, data}로 바꾼다.
 * 사용 예: throw new BusinessException('ROOM_FULL')
 *          throw new BusinessException('PERIOD_CONFLICTS_VISITS', { visitIds: [1, 2] })
 */
export class BusinessException extends HttpException {
  constructor(
    // 생성자 매개변수 앞의 readonly 는 같은 이름의 필드를 자동으로 만든다.
    // 필터가 exception.code / exception.data 로 꺼내 쓴다.
    readonly code: ErrorCodeName,
    // 클라이언트에 함께 내려줄 부가 정보(예: 영향받는 신청 id 목록). 없으면 null.
    readonly data: unknown = null,
    // 기본 메시지 대신 직접 지정하고 싶을 때만 사용
    message?: string,
  ) {
    // 부모(HttpException)에 메시지와 HTTP 상태코드를 전달한다.
    // 메시지·상태는 error-code.ts 에 정의된 값을 사용 → 코드 하나만 알면 나머지는 자동으로 정해진다.
    super(message ?? ErrorCode[code].message, ErrorCode[code].status);
  }
}
