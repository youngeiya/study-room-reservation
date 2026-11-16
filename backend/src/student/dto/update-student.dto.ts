import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PHONE_MESSAGE,
  PHONE_PATTERN,
  STUDENT_NO_MESSAGE,
  STUDENT_NO_PATTERN,
  ZIP_CODE_MESSAGE,
  ZIP_CODE_PATTERN,
} from './create-student.dto';
import { STUDENT_STATUSES } from '../student.entity';
import type { StudentStatus } from '../student.entity';

/**
 * 보낸 필드만 수정한다 (PATCH).
 * 선택 필드(학부모 연락처·학년·메모)는 null 을 보내면 값을 비운다.
 */
export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(STUDENT_NO_PATTERN, { message: STUDENT_NO_MESSAGE })
  studentNo?: string;

  // 비밀번호 재설정 (선택). 보내면 새 비밀번호로 바뀐다.
  @IsOptional()
  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  password?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  guardianPhone?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ZIP_CODE_PATTERN, { message: ZIP_CODE_MESSAGE })
  zipCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressDetail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  grade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string | null;

  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: StudentStatus;
}
