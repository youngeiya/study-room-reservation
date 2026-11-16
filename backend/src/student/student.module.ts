import { Module } from '@nestjs/common';
import { Database } from '../storage/database';
import { VisitDataModule } from '../visit/visit-data.module';
import {
  STUDENT_COLLECTION,
  STUDENT_REPOSITORY,
  Student,
} from './student.entity';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

// 모듈 = "이 기능에 필요한 부품 묶음". 어떤 컨트롤러·서비스·저장소가 있는지 선언한다.
@Module({
  // 학생 삭제 시 방문 신청이 남아 있는지 확인하려고 신청 저장소가 필요하다.
  // (VisitModule 은 StudentModule 을 import 하므로, 순환을 피하려고 저장소만 가진 VisitDataModule 을 가져온다)
  imports: [VisitDataModule],
  controllers: [StudentController], // 이 모듈이 처리하는 HTTP 요청
  providers: [
    StudentService,
    {
      // STUDENT_REPOSITORY 라는 이름표로 저장소를 등록한다 (JSON 인지 Oracle 인지는 Database 가 정한다).
      // 서비스는 @Inject(STUDENT_REPOSITORY) 로 이 객체를 받는다.
      provide: STUDENT_REPOSITORY,
      // 저장 방식을 바꾸려면(예: 실제 DB) 이 한 곳의 구현체만 교체하면 된다.
      useFactory: (db: Database) => db.repository<Student>(STUDENT_COLLECTION),
      // 팩토리가 필요로 하는 의존성 (위 db 매개변수로 들어온다)
      inject: [Database],
    },
  ],
  // 다른 모듈이 쓸 수 있게 내보낸다 (이후 방문 신청 모듈이 학생을 조회할 때 사용)
  exports: [StudentService, STUDENT_REPOSITORY],
})
export class StudentModule {}
