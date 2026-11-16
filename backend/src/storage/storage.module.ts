import { Global, Logger, Module } from '@nestjs/common';
import { join } from 'node:path';
import { Database } from './database';
import { JsonDatabase } from './json-database';
import { OracleDatabase } from './oracle/oracle-database';

// 설정은 환경 변수로 받는다. 현재 폴더(backend)의 .env 파일이 있으면 읽는다 (이미 설정된 환경 변수는 덮어쓰지 않는다).
function loadEnvFile() {
  try {
    process.loadEnvFile();
  } catch {
    // .env 가 없으면 그냥 넘어간다 (기본값 JSON 으로 동작)
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `DB_TYPE=oracle 이면 환경 변수 ${name} 이(가) 필요합니다. (backend/.env.example 참고)`,
    );
  }
  return value;
}

// @Global: 모든 모듈에서 Database 를 바로 주입받을 수 있다.
@Global()
@Module({
  providers: [
    {
      // 서비스와 모듈은 추상 클래스 Database 에만 의존한다. 어떤 구현을 쓸지는 여기서 환경 변수로 정한다.
      //   DB_TYPE=json   (기본) JSON 파일. 설치 없이 바로 실행된다.  DB_FILE 로 파일 경로를 바꿀 수 있다.
      //   DB_TYPE=oracle Oracle. ORACLE_USER / ORACLE_PASSWORD / ORACLE_CONNECT_STRING 이 필요하다.
      //
      // 비동기 팩토리: 파일 로드 / DB 접속이 끝난 뒤에야 다른 모듈이 이 DB를 주입받는다.
      // (Spring 의 @Bean 메서드와 비슷한 "만드는 방법"을 직접 알려주는 팩토리 Provider)
      provide: Database,
      useFactory: async (): Promise<Database> => {
        loadEnvFile();
        const type = (process.env.DB_TYPE ?? 'json').toLowerCase();

        if (type === 'oracle') {
          return OracleDatabase.connect({
            user: required('ORACLE_USER'),
            password: required('ORACLE_PASSWORD'),
            connectString: required('ORACLE_CONNECT_STRING'),
          });
        }
        if (type !== 'json') {
          throw new Error(
            `알 수 없는 DB_TYPE 입니다: ${type} (json 또는 oracle)`,
          );
        }

        const file =
          process.env.DB_FILE ?? join(process.cwd(), 'data', 'db.json');
        const db = new JsonDatabase(file);
        await db.init();
        new Logger('Storage').log(`JSON 파일 DB 사용: ${file}`);
        return db;
      },
    },
  ],
  exports: [Database],
})
export class StorageModule {}
