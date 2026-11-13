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
  exports: [STUDY_ROOM_REPOSITORY],
})
export class StudyRoomModule {}
