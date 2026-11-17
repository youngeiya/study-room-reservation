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
import { HALL_CODES } from '../hall';
import type { HallCode } from '../hall';

export class CreateStudyRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  // 소속 관: 자습실은 반드시 한 관에 속한다
  @IsIn(HALL_CODES, { message: '관을 선택해 주세요.' })
  hall: HallCode;

  @IsInt()
  @Min(1)
  @Max(500, { message: '최대 인원은 500명까지 설정할 수 있습니다.' })
  maxPersonnel: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
