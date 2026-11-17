import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// 로그인 아이디 형식: 영문·숫자·밑줄·점·하이픈 3~50자
export const LOGIN_ID_PATTERN = /^[A-Za-z0-9_.-]{3,50}$/;
export const LOGIN_ID_MESSAGE =
  '아이디는 영문·숫자·밑줄(_)·점(.)·하이픈(-) 3~50자로 입력해 주세요.';

export class CreateInstructorDto {
  @IsString()
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name!: string;

  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  password!: string;
}

/** 보낸 필드만 수정한다 (PATCH). password 를 보내면 비밀번호가 재설정된다. */
export class UpdateInstructorDto {
  @IsOptional()
  @IsString()
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  password?: string;
}
