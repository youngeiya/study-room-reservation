import { Module } from '@nestjs/common';
import { JsonDatabase } from '../storage/json-database';
import { JsonRepository } from '../storage/json-repository';
import {
  STUDENT_COLLECTION,
  STUDENT_REPOSITORY,
  Student,
} from './student.entity';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  controllers: [StudentController],
  providers: [
    StudentService,
    {
      provide: STUDENT_REPOSITORY,
      // 저장 방식을 바꾸려면(예: 실제 DB) 이 한 곳의 구현체만 교체하면 된다.
      useFactory: (db: JsonDatabase) =>
        new JsonRepository<Student>(db, STUDENT_COLLECTION),
      inject: [JsonDatabase],
    },
  ],
  exports: [StudentService, STUDENT_REPOSITORY],
})
export class StudentModule {}
