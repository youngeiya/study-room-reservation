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
import { CreateStudyRoomDto } from './dto/create-study-room.dto';
import { UpdateStudyRoomDto } from './dto/update-study-room.dto';
import { StudyRoom } from './study-room.entity';
import { StudyRoomService } from './study-room.service';

/**
 * 컨트롤러는 "요청을 받아 서비스에 넘기고 결과를 반환"만 한다. 규칙은 서비스에 있다.
 * 반환값은 ResponseInterceptor 가 {code:'OK', ...} 로 감싸 주고,
 * 예외는 AllExceptionsFilter 가 {code:'ROOM_FULL', ...} 등으로 바꿔 준다.
 */
// 전역 prefix 와 합쳐져 /api/study-rooms
@Controller('study-rooms')
export class StudyRoomController {
  constructor(private readonly studyRoomService: StudyRoomService) {}

  // GET /api/study-rooms : 목록
  @Get()
  findAll(): Promise<StudyRoom[]> {
    return this.studyRoomService.findAll();
  }

  // GET /api/study-rooms/1 : 상세. ParseIntPipe 가 "1" 문자열을 숫자 1 로 바꾼다 ("abc" 면 400 에러)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<StudyRoom> {
    return this.studyRoomService.findOne(id);
  }

  // POST /api/study-rooms : 등록. @Body 는 요청 JSON → DTO. 형식 검사는 ValidationPipe 가 먼저 한다.
  @Post()
  create(@Body() dto: CreateStudyRoomDto): Promise<StudyRoom> {
    return this.studyRoomService.create(dto);
  }

  // PATCH /api/study-rooms/1 : 일부 필드 수정
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudyRoomDto,
  ): Promise<StudyRoom> {
    return this.studyRoomService.update(id, dto);
  }

  // DELETE /api/study-rooms/1 : 삭제 (실제로는 deletedAt 만 채우는 Soft Delete)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.studyRoomService.remove(id);
  }
}
