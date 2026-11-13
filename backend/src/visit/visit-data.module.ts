import { Module } from '@nestjs/common';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
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
      useFactory: (db: JsonDatabase) =>
        new JsonRepository<VisitReservation>(db, VISIT_COLLECTION),
      inject: [JsonDatabase],
    },
    {
      provide: VISIT_HISTORY_REPOSITORY,
      useFactory: (db: JsonDatabase) =>
        new JsonRepository<VisitHistory>(db, VISIT_HISTORY_COLLECTION),
      inject: [JsonDatabase],
    },
  ],
  exports: [VISIT_REPOSITORY, VISIT_HISTORY_REPOSITORY],
})
export class VisitDataModule {}
