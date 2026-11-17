import {
  ArrayUnique,
  IsArray,
  IsEmail,
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
} from '../../student/dto/create-student.dto';
import {
  INSTRUCTOR_POSITIONS,
  INSTRUCTOR_STATUSES,
  SUBJECTS,
} from '../instructor.entity';
import type {
  InstructorPosition,
  InstructorStatus,
  Subject,
} from '../instructor.entity';

// 로그인 아이디 형식: 영문·숫자·밑줄·점·하이픈 3~50자
export const LOGIN_ID_PATTERN = /^[A-Za-z0-9_.-]{3,50}$/;
export const LOGIN_ID_MESSAGE =
  '아이디는 영문·숫자·밑줄(_)·점(.)·하이픈(-) 3~50자로 입력해 주세요.';
// 사번 형식: 영문·숫자·하이픈 2~20자
export const EMPLOYEE_NO_PATTERN = /^[A-Za-z0-9-]{2,20}$/;
export const EMPLOYEE_NO_MESSAGE =
  '사번은 영문·숫자·하이픈 2~20자로 입력해 주세요.';
// 입사일 형식 (실제로 있는 날짜인지는 서비스가 한 번 더 확인한다)
export const HIRE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const HIRE_DATE_MESSAGE = '입사일은 YYYY-MM-DD 형식으로 입력해 주세요.';

export class CreateInstructorDto {
  @IsString()
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId!: string;

  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name!: string;

  @IsString()
  @Matches(EMPLOYEE_NO_PATTERN, { message: EMPLOYEE_NO_MESSAGE })
  employeeNo!: string;

  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  // 선택 값: 보내지 않거나 null 이면 "없음"
  @IsOptional()
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(100)
  email?: string | null;

  @IsOptional()
  @IsIn(INSTRUCTOR_POSITIONS)
  position?: InstructorPosition;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(SUBJECTS, { each: true })
  subjects?: Subject[];

  @IsOptional()
  @IsString()
  @Matches(HIRE_DATE_PATTERN, { message: HIRE_DATE_MESSAGE })
  hireDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string | null;
}

/**
 * 보낸 필드만 수정한다 (PATCH). password 를 보내면 비밀번호가 재설정된다.
 * 선택 필드(이메일·입사일·메모)는 null 을 보내면 값을 비운다.
 */
export class UpdateInstructorDto {
  @IsOptional()
  @IsString()
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId?: string;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  password?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(EMPLOYEE_NO_PATTERN, { message: EMPLOYEE_NO_MESSAGE })
  employeeNo?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(100)
  email?: string | null;

  @IsOptional()
  @IsIn(INSTRUCTOR_POSITIONS)
  position?: InstructorPosition;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(SUBJECTS, { each: true })
  subjects?: Subject[];

  @IsOptional()
  @IsIn(INSTRUCTOR_STATUSES)
  status?: InstructorStatus;

  @IsOptional()
  @IsString()
  @Matches(HIRE_DATE_PATTERN, { message: HIRE_DATE_MESSAGE })
  hireDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string | null;
}
