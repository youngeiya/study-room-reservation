import { IsDateString, IsInt, Min } from 'class-validator';

/** 방문 신청. 로그인이 없으므로 "누가 신청하는지"는 studentId 로 받는다. */
export class CreateVisitDto {
  @IsInt()
  @Min(1)
  studentId: number;

  @IsDateString()
  visitAt: string;
}
