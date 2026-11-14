import { IsDateString, IsInt, Min } from 'class-validator';

/** 방문 시간 수정. studentId 는 "본인 신청인지" 확인하는 데 쓴다. */
export class UpdateVisitDto {
  @IsInt()
  @Min(1)
  studentId: number;

  @IsDateString()
  visitAt: string;
}
