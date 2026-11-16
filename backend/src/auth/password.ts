import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * 비밀번호 해시. 비밀번호 원문은 저장하지 않고, 되돌릴 수 없는 값만 저장한다.
 * - scrypt: 일부러 느리고 메모리를 쓰는 해시라서 무차별 대입 공격이 어렵다 (Node 내장, 별도 설치 없음).
 * - salt: 사람마다 다른 무작위 값을 섞어서, 같은 비밀번호여도 해시가 달라진다.
 * 저장 형식: "salt(hex):hash(hex)"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** 입력한 비밀번호가 저장된 해시와 같은지 확인한다. 해시가 없거나 형식이 틀리면 false. */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );
  // 같은 길이의 두 값을 "걸린 시간이 일정하게" 비교한다 (시간 차이로 값을 추측하는 공격 방지)
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
