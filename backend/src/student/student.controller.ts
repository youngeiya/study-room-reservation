import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentView } from './student.entity';
import { StudentService } from './student.service';

// 학생 관리는 강사만 할 수 있다 (학생이 다른 학생의 정보를 보거나 바꿀 수 없다).
// 응답에는 비밀번호 해시가 빠진 StudentView 만 나간다.
@Roles('INSTRUCTOR')
@Controller('students')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  /** FR-STD-01 학생 목록 */
  @Get()
  findAll(): Promise<StudentView[]> {
    return this.studentService.findAll();
  }

  /** FR-STD-02 학생 등록 */
  @Post()
  create(@Body() dto: CreateStudentDto): Promise<StudentView> {
    return this.studentService.create(dto);
  }

  /** FR-STD-02 학생 수정 (보낸 필드만) */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentView> {
    return this.studentService.update(id, dto);
  }

  /** FR-STD-02 학생 삭제 (Soft Delete) */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.studentService.remove(id);
  }
}
