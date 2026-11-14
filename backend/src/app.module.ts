import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { StorageModule } from './storage/storage.module';
import { StudentModule } from './student/student.module';
import { StudyRoomModule } from './study-room/study-room.module';
import { VisitModule } from './visit/visit.module';

/**
 * 루트 모듈. 앱을 구성하는 모듈을 한곳에 모은다.
 * (CommonModule / StorageModule 은 @Global 이라 한 번만 import 하면 어디서든 쓸 수 있다)
 */
@Module({
  imports: [
    CommonModule, // 응답 포맷, 예외 필터, Clock
    StorageModule, // JSON 파일 DB
    StudentModule, // 학생
    StudyRoomModule, // 자습실
    VisitModule, // 방문 신청·이력
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
