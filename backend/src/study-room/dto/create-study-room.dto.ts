import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { BRANCH_CODES } from '../branch';
import type { BranchCode } from '../branch';

export class CreateStudyRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  // 소속 지점: 자습실은 반드시 한 지점에 속한다
  @IsIn(BRANCH_CODES, { message: '지점을 선택해 주세요.' })
  branch: BranchCode;

  @IsInt()
  @Min(1)
  @Max(500, { message: '최대 인원은 500명까지 설정할 수 있습니다.' })
  maxPersonnel: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
