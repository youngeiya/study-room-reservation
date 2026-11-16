import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService, LoginResult } from './auth.service';
import type { AuthUser } from './auth.types';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';

/** 로그인·내 정보·비밀번호 변경. 전역 경로 /api/auth */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/auth/login : 로그인 (새로 만드는 게 아니라 확인이라 200). 로그인 전에 호출하므로 @Public
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.role, dto.loginId, dto.password);
  }

  // GET /api/auth/me : 토큰이 지금도 유효한지 확인하고 내 정보를 돌려준다 (화면이 새로고침될 때 사용)
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AuthUser> {
    return this.authService.me(user);
  }

  // PATCH /api/auth/password : 내 비밀번호 변경 (강사·학생 공통)
  @Patch('password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      user,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
