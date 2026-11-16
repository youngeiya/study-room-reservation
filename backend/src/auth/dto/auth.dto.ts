import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Role } from '../auth.types';

/** 로그인 요청. 화면의 라디오 버튼(강사/학생)이 role 이 된다. */
export class LoginDto {
  @IsIn(['INSTRUCTOR', 'STUDENT'])
  role!: Role;

  /** 강사는 아이디, 학생은 학번 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  loginId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password!: string;
}

/** 비밀번호 변경 요청 (강사·학생 공통) */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  currentPassword!: string;

  @IsString()
  @MinLength(4, { message: '새 비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(50)
  newPassword!: string;
}
