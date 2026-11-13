import { Controller, Get } from '@nestjs/common';
import { Student } from './student.entity';
import { StudentService } from './student.service';

@Controller('students')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  /** FR-STD-01 학생 목록 */
  @Get()
  findAll(): Promise<Student[]> {
    return this.studentService.findAll();
  }
}
