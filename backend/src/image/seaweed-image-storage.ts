import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { ImageStorage, StoredImage } from './image-storage';

const TIMEOUT_MS = 10_000;

/**
 * SeaweedFS Filer 의 HTTP API 로 파일을 저장·조회·삭제한다.
 *  - 저장: POST {filer}/{key}  (multipart, 필드명 file)
 *  - 조회: GET  {filer}/{key}
 *  - 삭제: DELETE {filer}/{key}
 * Filer 주소는 환경 변수 SEAWEEDFS_FILER_URL (기본 http://localhost:8888).
 * Filer 는 서버 안(Docker 내부 네트워크)에서만 접근하고, 브라우저는 백엔드를 통해서만 이미지를 받는다.
 */
@Injectable()
export class SeaweedImageStorage extends ImageStorage {
  private readonly logger = new Logger(SeaweedImageStorage.name);

  private url(key: string): string {
    const base = (
      process.env.SEAWEEDFS_FILER_URL ?? 'http://localhost:8888'
    ).replace(/\/+$/, '');
    return `${base}/${key}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(data)], { type: contentType }),
      key.split('/').pop(),
    );
    const res = await this.call(this.url(key), { method: 'POST', body: form });
    if (!res.ok) this.fail(`PUT ${key} -> HTTP ${res.status}`);
  }

  async get(key: string): Promise<StoredImage | null> {
    const res = await this.call(this.url(key), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) this.fail(`GET ${key} -> HTTP ${res.status}`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType:
        res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.call(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404)
      this.fail(`DELETE ${key} -> HTTP ${res.status}`);
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.fail(`연결 실패: ${(error as Error).message}`);
    }
  }

  // 원인은 로그에만 남기고, 사용자에게는 일반적인 안내를 준다
  private fail(reason: string): never {
    this.logger.error(`SeaweedFS 오류: ${reason}`);
    throw new BusinessException('IMAGE_STORAGE_FAILED');
  }
}
