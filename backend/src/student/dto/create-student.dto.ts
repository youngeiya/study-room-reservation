import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// 전화번호 형식: 숫자와 하이픈만, 예) 010-1234-5678 / 01012345678
export const PHONE_PATTERN = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
export const PHONE_MESSAGE =
  '연락처 형식이 올바르지 않습니다. 예) 010-1234-5678';
// 학번 형식: 영문·숫자·하이픈 3~20자
export const STUDENT_NO_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
export const STUDENT_NO_MESSAGE =
  '학번은 영문·숫자·하이픈 3~20자로 입력해 주세요.';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name!: string;

  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @IsString()
  @Matches(STUDENT_NO_PATTERN, { message: STUDENT_NO_MESSAGE })
  studentNo!: string;

  // 초기 비밀번호 (선택). 보내지 않으면 학번과 같게 정한다.
  @IsOptional()
  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  password?: string;

  // 선택 값: 보내지 않거나 null 이면 "없음"
  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  guardianPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  grade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string | null;
}
