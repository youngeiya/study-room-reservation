import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { BRANCH_CODES } from '../branch';
import type { BranchCode } from '../branch';

/** 보낸 필드만 수정한다 (PATCH). */
export class UpdateStudyRoomDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsIn(BRANCH_CODES, { message: '지점을 선택해 주세요.' })
  branch?: BranchCode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500, { message: '최대 인원은 500명까지 설정할 수 있습니다.' })
  maxPersonnel?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
