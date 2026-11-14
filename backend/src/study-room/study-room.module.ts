import { Module } from '@nestjs/common';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import { VisitDataModule } from '../visit/visit-data.module';
import {
  STUDY_ROOM_COLLECTION,
  STUDY_ROOM_REPOSITORY,
  StudyRoom,
} from './study-room.entity';
import { StudyRoomController } from './study-room.controller';
import { StudyRoomService } from './study-room.service';

@Module({
  // 현재 신청 인원을 세려면 신청 저장소가 필요하다.
  // VisitModule 전체가 아니라 저장소만 가진 VisitDataModule 을 가져와서 순환 의존을 피한다.
  imports: [VisitDataModule],
  controllers: [StudyRoomController],
  providers: [
    StudyRoomService,
    {
      provide: STUDY_ROOM_REPOSITORY,
      useFactory: (db: JsonDatabase) =>
        new JsonRepository<StudyRoom>(db, STUDY_ROOM_COLLECTION),
      inject: [JsonDatabase],
    },
  ],
  // 방문 신청 모듈이 "자습실이 있는지, 삭제되었는지, 운영 기간이 맞는지" 확인할 때 사용한다.
  exports: [STUDY_ROOM_REPOSITORY],
})
export class StudyRoomModule {}
