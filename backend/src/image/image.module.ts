import { Global, Module } from '@nestjs/common';
import { ImageStorage } from './image-storage';
import { SeaweedImageStorage } from './seaweed-image-storage';

// 이미지 저장소(SeaweedFS). 구현을 바꾸려면 useClass 만 교체한다.
@Global()
@Module({
  providers: [{ provide: ImageStorage, useClass: SeaweedImageStorage }],
  exports: [ImageStorage],
})
export class ImageModule {}
