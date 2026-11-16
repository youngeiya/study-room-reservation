import { ImageStorage, StoredImage } from './image-storage';

/** 메모리에만 저장하는 이미지 저장소. 테스트에서 SeaweedFS 대신 쓴다. */
export class InMemoryImageStorage extends ImageStorage {
  readonly files = new Map<string, StoredImage>();
  /** true 로 두면 저장 시도가 실패한다 (오류 처리 테스트용) */
  failPut = false;

  put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (this.failPut) return Promise.reject(new Error('put failed'));
    this.files.set(key, { data, contentType });
    return Promise.resolve();
  }
  get(key: string): Promise<StoredImage | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}
