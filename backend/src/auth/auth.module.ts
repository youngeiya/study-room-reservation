import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InstructorModule } from '../instructor/instructor.module';
import { StudentModule } from '../student/student.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    InstructorModule, // 강사 계정 저장소
    StudentModule, // 학생 저장소 (학번으로 로그인)
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    // 전역 가드: 모든 API 에 로그인·권한 검사를 적용한다 (기본이 잠금, 열 곳만 @Public)
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
