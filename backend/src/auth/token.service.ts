import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { BusinessException } from '../common/business.exception';
import type { AuthUser, Role } from './auth.types';

// 토큰 유효 시간. 지나면 다시 로그인해야 한다.
const EXPIRES_IN = '12h';

/**
 * 로그인 토큰(JWT) 발급·검증.
 *
 * JWT 는 "누가 로그인했는지"를 서버가 서명해서 담은 문자열이다. 서버는 세션을 저장하지 않고 서명만 확인하면 되므로
 * 서버가 여러 대여도 같은 비밀키만 공유하면 된다. (대신 한 번 발급한 토큰을 만료 전에 취소하기는 어렵다)
 *
 * 서명용 비밀키는 환경 변수 JWT_SECRET. 없으면 서버가 뜰 때마다 무작위로 만든다
 * (그러면 서버를 다시 켤 때 모두 다시 로그인해야 하므로, 운영에서는 반드시 JWT_SECRET 을 지정한다).
 */
@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor() {
    const fromEnv = process.env.JWT_SECRET;
    if (fromEnv && fromEnv.length >= 16) {
      this.secret = fromEnv;
    } else {
      this.secret = randomBytes(32).toString('hex');
      new Logger(TokenService.name).warn(
        'JWT_SECRET(16자 이상)이 설정되지 않아 임시 비밀키를 사용합니다. 서버를 다시 켜면 모두 다시 로그인해야 합니다.',
      );
    }
  }

  sign(user: AuthUser): string {
    return jwt.sign(
      { role: user.role, name: user.name, loginId: user.loginId },
      this.secret,
      { subject: String(user.id), expiresIn: EXPIRES_IN, algorithm: 'HS256' },
    );
  }

  /** 토큰이 올바르고 만료되지 않았으면 사용자 정보를, 아니면 UNAUTHORIZED 예외를 던진다. */
  verify(token: string): AuthUser {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
      const role = payload.role as Role;
      const id = Number(payload.sub);
      if (
        (role !== 'INSTRUCTOR' && role !== 'STUDENT') ||
        !Number.isInteger(id)
      ) {
        throw new Error('잘못된 토큰 내용');
      }
      return {
        role,
        id,
        name: String(payload.name ?? ''),
        loginId: String(payload.loginId ?? ''),
      };
    } catch {
      throw new BusinessException('UNAUTHORIZED');
    }
  }
}
