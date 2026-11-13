import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStudyRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsInt()
  @Min(1)
  maxPersonnel: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
