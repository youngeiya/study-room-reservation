import { Global, Module } from '@nestjs/common';
import { join } from 'node:path';
import { JsonDatabase } from './json-database';

@Global()
@Module({
  providers: [
    {
      provide: JsonDatabase,
      // 파일 경로는 환경변수로 바꿀 수 있다 (테스트·배포 분리용).
      useFactory: () =>
        new JsonDatabase(
          process.env.DB_FILE ?? join(process.cwd(), 'data', 'db.json'),
        ),
    },
  ],
  exports: [JsonDatabase],
})
export class StorageModule {}
