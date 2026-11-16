import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BusinessException } from '../common/business.exception';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import type { AuthUser, Role } from './auth.types';
import { TokenService } from './token.service';

/**
 * 모든 API 에 적용되는 로그인·권한 검사 (Spring Security 의 필터 + @PreAuthorize 역할).
 *
 *  1) @Public() 이 붙은 API 는 통과 (예: 로그인)
 *  2) 그 외에는 "Authorization: Bearer 토큰" 이 올바른 것이어야 한다 → 아니면 401 UNAUTHORIZED
 *  3) @Roles(...) 가 있으면 토큰의 역할이 거기에 들어야 한다 → 아니면 403 FORBIDDEN
 *
 * 전역으로 등록(APP_GUARD)해서 "깜빡하고 검사를 안 붙인 API" 가 열려 있지 않게 한다 (기본이 잠금).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new BusinessException('UNAUTHORIZED');
    }
    const user = this.tokens.verify(token); // 틀렸거나 만료면 UNAUTHORIZED
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (roles && !roles.includes(user.role)) {
      throw new BusinessException('FORBIDDEN');
    }
    return true;
  }
}
