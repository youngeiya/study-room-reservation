import { HttpStatus } from '@nestjs/common';

/**
 * 서비스 에러 코드 정의. 코드(UPPER_SNAKE_CASE)와 HTTP 상태, 기본 메시지를 한곳에서 관리한다.
 * 새 규칙이 생기면 여기에만 추가하면 필터가 응답으로 변환한다.
 */
export const ErrorCode = {
  VALIDATION_FAILED: {
    status: HttpStatus.BAD_REQUEST,
    message: '요청 값이 올바르지 않습니다.',
  },
  INVALID_PERIOD: {
    status: HttpStatus.BAD_REQUEST,
    message: '시작 일시는 종료 일시보다 빨라야 합니다.',
  },
  ROOM_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '자습실을 찾을 수 없습니다.',
  },
  STUDENT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '학생을 찾을 수 없습니다.',
  },
  VISIT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '방문 신청을 찾을 수 없습니다.',
  },
  ROOM_DELETED: {
    status: HttpStatus.CONFLICT,
    message: '삭제된 자습실입니다.',
  },
  ROOM_FULL: {
    status: HttpStatus.CONFLICT,
    message: '자습실 정원이 가득 찼습니다.',
  },
  ALREADY_APPLIED: {
    status: HttpStatus.CONFLICT,
    message: '이미 신청한 자습실입니다.',
  },
  OUT_OF_PERIOD: {
    status: HttpStatus.BAD_REQUEST,
    message: '방문 시간이 자습실 운영 기간을 벗어났습니다.',
  },
  NOT_VISIT_OWNER: {
    status: HttpStatus.FORBIDDEN,
    message: '본인의 방문 신청만 수정·취소할 수 있습니다.',
  },
  VISIT_ALREADY_CANCELLED: {
    status: HttpStatus.CONFLICT,
    message: '이미 취소된 신청입니다.',
  },
  CAPACITY_BELOW_APPLIED: {
    status: HttpStatus.CONFLICT,
    message: '현재 신청 인원보다 최대 인원을 작게 줄일 수 없습니다.',
  },
  PERIOD_CONFLICTS_VISITS: {
    status: HttpStatus.CONFLICT,
    message: '변경할 운영 기간을 벗어나는 신청이 있습니다.',
  },
  CONCURRENT_MODIFICATION: {
    status: HttpStatus.CONFLICT,
    message: '다른 요청이 먼저 처리되었습니다. 잠시 후 다시 시도해 주세요.',
  },
  INTERNAL_ERROR: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: '서버 오류가 발생했습니다.',
  },
} as const;

export type ErrorCodeName = keyof typeof ErrorCode;
