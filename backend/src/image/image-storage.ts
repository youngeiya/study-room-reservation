/** 저장소에서 읽어 온 이미지 */
export interface StoredImage {
  data: Buffer;
  contentType: string;
}

/**
 * 이미지 파일을 저장하는 곳. DB 에는 파일 자체가 아니라 "key(파일 경로)"만 저장한다.
 * 구현체(SeaweedFS)를 바꾸고 싶으면 이 클래스를 상속한 구현만 갈아 끼우면 된다.
 * (Database 추상 클래스와 같은 방식)
 */
export abstract class ImageStorage {
  abstract put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** 없으면 null */
  abstract get(key: string): Promise<StoredImage | null>;
  /** 없어도 오류가 아니다 */
  abstract delete(key: string): Promise<void>;
}
