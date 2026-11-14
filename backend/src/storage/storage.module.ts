import { Global, Module } from '@nestjs/common';
import { join } from 'node:path';
import { JsonDatabase } from './json-database';

// @Global: 모든 모듈에서 JsonDatabase 를 바로 주입받을 수 있다.
@Global()
@Module({
  providers: [
    {
      provide: JsonDatabase,
      // JsonDatabase 는 생성자에 파일 경로(문자열)가 필요해서 Nest 가 자동으로 만들 수 없다.
      // 그래서 "만드는 방법"을 직접 알려주는 팩토리 Provider 를 쓴다 (Spring 의 @Bean 메서드와 비슷).
      //
      // 파일 경로는 환경변수 DB_FILE 로 바꿀 수 있다 (테스트·배포 분리용). 기본값: backend/data/db.json
      // 비동기 팩토리: 파일 로드(init)가 끝난 뒤에야 다른 모듈이 이 DB를 주입받는다.
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
