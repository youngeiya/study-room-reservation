import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { StorageModule } from './storage/storage.module';
import { StudentModule } from './student/student.module';
import { StudyRoomModule } from './study-room/study-room.module';

@Module({
  imports: [CommonModule, StorageModule, StudentModule, StudyRoomModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
