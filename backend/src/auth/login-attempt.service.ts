import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { Clock } from '../common/clock.service';
import type { Role } from './auth.types';

// 기본값: 연속 5번 실패하면 5분 동안 그 계정의 로그인을 막는다. 환경 변수로 바꿀 수 있다 (잘못된 값이면 기본값).
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_MINUTES = 5;
// 기록이 무한히 쌓이지 않게, 이 개수를 넘으면 만료된 기록부터 정리한다
const CLEANUP_THRESHOLD = 10_000;

function positiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

interface Entry {
  failures: number;
  /** 이 시각까지 로그인 불가 (잠기지 않았으면 0) */
  lockedUntil: number;
  /** 마지막 실패 시각. 오래 지나면 기록을 정리한다 */
  lastFailureAt: number;
}

/**
 * 로그인 시도 제한 (무차별 대입 공격 방어).
 *
 * 계정(역할 + 로그인 아이디)별로 연속 실패 횟수를 세고, 한도에 이르면 일정 시간 로그인을 막는다.
 * 성공하면 횟수를 지운다. 없는 아이디도 같은 방식으로 세서, 응답만으로 "존재하는 아이디인지" 알 수 없게 한다.
 *
 * 한계 (README 에도 적어 둠)
 * - 메모리에 보관하므로 서버를 다시 켜면 초기화되고, 서버가 여러 대면 서버마다 따로 센다 (여러 대에서는 Redis 같은 공유 저장소가 필요).
 * - 계정 기준이라서 누군가 일부러 남의 계정으로 실패를 반복해 잠글 수 있다. (IP 기준 제한을 더하면 보완되지만,
 *   nginx 뒤에서는 실제 IP 를 받는 설정이 먼저 필요하다)
 */
@Injectable()
export class LoginAttemptService {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly clock: Clock) {}

  /** 잠겨 있으면 TOO_MANY_LOGIN_ATTEMPTS 예외를 던진다 (비밀번호 확인보다 먼저 호출한다). */
  assertNotLocked(role: Role, loginId: string): void {
    const entry = this.entries.get(this.key(role, loginId));
    if (!entry) return;
    const now = this.clock.now().getTime();
    if (entry.lockedUntil > now) {
      throw new BusinessException('TOO_MANY_LOGIN_ATTEMPTS', {
        retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
      });
    }
  }

  /** 로그인에 실패했을 때 호출한다. 한도에 이르면 잠근다. */
  recordFailure(role: Role, loginId: string): void {
    const now = this.clock.now().getTime();
    const key = this.key(role, loginId);
    let entry = this.entries.get(key);
    // 잠금이 풀린 뒤의 첫 실패부터는 다시 센다
    if (!entry || (entry.lockedUntil !== 0 && entry.lockedUntil <= now)) {
      entry = { failures: 0, lockedUntil: 0, lastFailureAt: now };
    }
    entry.failures += 1;
    entry.lastFailureAt = now;
    if (
      entry.failures >= positiveInt('LOGIN_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS)
    ) {
      entry.lockedUntil =
        now + positiveInt('LOGIN_LOCK_MINUTES', DEFAULT_LOCK_MINUTES) * 60_000;
    }
    this.entries.set(key, entry);
    this.cleanup(now);
  }

  /** 로그인에 성공하면 그 계정의 실패 기록을 지운다. */
  recordSuccess(role: Role, loginId: string): void {
    this.entries.delete(this.key(role, loginId));
  }

  // 대소문자·앞뒤 공백 차이로 제한을 피하지 못하게 정규화한다
  private key(role: Role, loginId: string): string {
    return `${role}:${loginId.trim().toLowerCase()}`;
  }

  private cleanup(now: number) {
    if (this.entries.size <= CLEANUP_THRESHOLD) return;
    const ttl =
      positiveInt('LOGIN_LOCK_MINUTES', DEFAULT_LOCK_MINUTES) * 60_000;
    for (const [key, e] of this.entries) {
      if (e.lockedUntil <= now && now - e.lastFailureAt > ttl)
        this.entries.delete(key);
    }
  }
}
