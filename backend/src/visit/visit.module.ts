import { Module } from '@nestjs/common';
import { StudentModule } from '../student/student.module';
import { StudyRoomModule } from '../study-room/study-room.module';
import { VisitController } from './visit.controller';
import { VisitDataModule } from './visit-data.module';
import { VisitService } from './visit.service';

@Module({
  // 신청 저장소(VisitDataModule) + 자습실·학생 저장소를 가져온다.
  // StudyRoomModule 은 VisitDataModule 만 import 하므로 서로 순환하지 않는다.
  imports: [VisitDataModule, StudyRoomModule, StudentModule],
  controllers: [VisitController],
  providers: [VisitService],
})
export class VisitModule {}
