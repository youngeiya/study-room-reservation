import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class CreateStudyRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsInt()
  @Min(1)
  @Max(500, { message: '최대 인원은 500명까지 설정할 수 있습니다.' })
  maxPersonnel: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
