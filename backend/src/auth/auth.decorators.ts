import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, Role } from './auth.types';

// 메타데이터 이름표 (가드가 읽는다)
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** 로그인 없이 호출할 수 있는 API. (기본은 모든 API 가 로그인을 요구한다) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** 이 API 를 쓸 수 있는 역할. 지정하지 않으면 로그인만 하면 누구나 쓸 수 있다. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** 요청한 사용자(토큰에서 꺼낸 값)를 컨트롤러 매개변수로 받는다. 예) create(@CurrentUser() user: AuthUser) */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);
