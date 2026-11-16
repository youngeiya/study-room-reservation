import { Module } from '@nestjs/common';
import { Database } from '../storage/database';
import {
  INSTRUCTOR_COLLECTION,
  INSTRUCTOR_REPOSITORY,
  Instructor,
} from './instructor.entity';
import { InstructorService } from './instructor.service';

@Module({
  providers: [
    InstructorService,
    {
      provide: INSTRUCTOR_REPOSITORY,
      useFactory: (db: Database) =>
        db.repository<Instructor>(INSTRUCTOR_COLLECTION),
      inject: [Database],
    },
  ],
  // 로그인(AuthModule)이 강사 계정을 조회·수정할 때 쓴다
  exports: [INSTRUCTOR_REPOSITORY],
})
export class InstructorModule {}
