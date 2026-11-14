import { IsInt, Min } from 'class-validator';

/** 방문 취소. studentId 는 "본인 신청인지" 확인하는 데 쓴다. */
export class CancelVisitDto {
  @IsInt()
  @Min(1)
  studentId: number;
}
