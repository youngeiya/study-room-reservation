import { IsDateString } from 'class-validator';

/**
 * 방문 신청·수정의 HTTP 요청 body. studentId 는 받지 않는다 (로그인한 학생의 토큰에서 가져온다).
 * 서비스 안에서는 studentId 가 포함된 CreateVisitDto / UpdateVisitDto 를 그대로 쓴다.
 */
export class CreateVisitBodyDto {
  @IsDateString()
  visitAt!: string;
}

export class UpdateVisitBodyDto {
  @IsDateString()
  visitAt!: string;
}
