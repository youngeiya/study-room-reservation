import { Global, Module } from '@nestjs/common';
import { join } from 'node:path';
import { JsonDatabase } from './json-database';

@Global()
@Module({
  providers: [
    {
      provide: JsonDatabase,
      // 파일 경로는 환경변수로 바꿀 수 있다 (테스트·배포 분리용).
      // 비동기 팩토리: 파일 로드가 끝난 뒤에야 다른 모듈이 이 DB를 주입받는다.
      useFactory: async () => {
        const db = new JsonDatabase(
          process.env.DB_FILE ?? join(process.cwd(), 'data', 'db.json'),
        );
        await db.init();
        return db;
      },
    },
  ],
  exports: [JsonDatabase],
})
export class StorageModule {}
