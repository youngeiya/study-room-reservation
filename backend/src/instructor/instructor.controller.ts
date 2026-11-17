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
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CreateInstructorDto, UpdateInstructorDto } from './dto/instructor.dto';
import { InstructorView } from './instructor.entity';
import { InstructorService } from './instructor.service';

// 강사 계정 관리는 강사만 할 수 있다. 응답에는 비밀번호 해시가 빠진 InstructorView 만 나간다.
@Roles('INSTRUCTOR')
@Controller('instructors')
export class InstructorController {
  constructor(private readonly instructorService: InstructorService) {}

  /** 강사 목록 */
  @Get()
  findAll(): Promise<InstructorView[]> {
    return this.instructorService.findAll();
  }

  /** 강사 등록 */
  @Post()
  create(@Body() dto: CreateInstructorDto): Promise<InstructorView> {
    return this.instructorService.create(dto);
  }

  /** 강사 수정 (보낸 필드만, password 로 비밀번호 재설정) */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstructorDto,
  ): Promise<InstructorView> {
    return this.instructorService.update(id, dto);
  }

  /** 강사 삭제 (Soft Delete). 자기 자신은 삭제할 수 없다. */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.instructorService.remove(id, user.id);
  }
}
