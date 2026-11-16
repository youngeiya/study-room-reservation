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
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
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

  /** FR-STD-02 학생 등록 */
  @Post()
  create(@Body() dto: CreateStudentDto): Promise<Student> {
    return this.studentService.create(dto);
  }

  /** FR-STD-02 학생 수정 (보낸 필드만) */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
  ): Promise<Student> {
    return this.studentService.update(id, dto);
  }

  /** FR-STD-02 학생 삭제 (Soft Delete) */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.studentService.remove(id);
  }
}
