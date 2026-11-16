import { Module } from '@nestjs/common';
import { Database } from '../storage/database';
import {
  VISIT_COLLECTION,
  VISIT_HISTORY_COLLECTION,
  VISIT_HISTORY_REPOSITORY,
  VISIT_REPOSITORY,
  VisitHistory,
  VisitReservation,
} from './visit.entity';

/**
 * 방문 신청·이력 "저장소만" 제공하는 모듈.
 * StudyRoomModule과 VisitModule이 서로를 import하면 순환 의존이 되므로,
 * 둘 다 이 모듈에서 저장소를 가져다 쓰도록 분리했다.
 */
@Module({
  providers: [
    {
      provide: VISIT_REPOSITORY,
      useFactory: (db: Database) =>
        db.repository<VisitReservation>(VISIT_COLLECTION),
      inject: [Database],
    },
    {
      provide: VISIT_HISTORY_REPOSITORY,
      useFactory: (db: Database) =>
        db.repository<VisitHistory>(VISIT_HISTORY_COLLECTION),
      inject: [Database],
    },
  ],
  exports: [VISIT_REPOSITORY, VISIT_HISTORY_REPOSITORY],
})
export class VisitDataModule {}
