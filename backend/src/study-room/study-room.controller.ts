import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public, Roles } from '../auth/auth.decorators';
import { BusinessException } from '../common/business.exception';
import { CreateStudyRoomDto } from './dto/create-study-room.dto';
import { UpdateStudyRoomDto } from './dto/update-study-room.dto';
import { StudyRoom } from './study-room.entity';
import { StudyRoomService } from './study-room.service';

// 사진 한 장 최대 크기 (nginx 의 client_max_body_size 도 이보다 크게 둔다)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

  // POST /api/study-rooms : 등록 (강사). @Body 는 요청 JSON → DTO. 형식 검사는 ValidationPipe 가 먼저 한다.
  @Roles('INSTRUCTOR')
  @Post()
  create(@Body() dto: CreateStudyRoomDto): Promise<StudyRoom> {
    return this.studyRoomService.create(dto);
  }

  // PATCH /api/study-rooms/1 : 일부 필드 수정
  @Roles('INSTRUCTOR')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudyRoomDto,
  ): Promise<StudyRoom> {
    return this.studyRoomService.update(id, dto);
  }

  // GET /api/study-rooms/1/image : 자습실 사진. <img src> 는 로그인 토큰을 실어 보낼 수 없어서 공개로 둔다
  // (자습실 사진은 개인정보가 아니다). 파일 내용을 그대로 응답하므로 {code,data} 포맷을 쓰지 않는다.
  @Public()
  @Get(':id/image')
  async image(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.studyRoomService.getImage(id);
    res.setHeader('Content-Type', image.contentType);
    // 사진을 바꾸면 파일 경로(주소의 v 값)가 바뀌므로 오래 캐시해도 안전하다
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(image.data);
  }

  // POST /api/study-rooms/1/image : 사진 등록·교체 (강사). multipart 의 file 필드
  @Roles('INSTRUCTOR')
  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: { buffer: Buffer },
  ): Promise<StudyRoom> {
    if (!file) throw new BusinessException('IMAGE_REQUIRED');
    return this.studyRoomService.setImage(id, file.buffer);
  }

  // DELETE /api/study-rooms/1/image : 사진 삭제 (강사)
  @Roles('INSTRUCTOR')
  @Delete(':id/image')
  removeImage(@Param('id', ParseIntPipe) id: number): Promise<StudyRoom> {
    return this.studyRoomService.removeImage(id);
  }

  // DELETE /api/study-rooms/1 : 삭제 (실제로는 deletedAt 만 채우는 Soft Delete)
  @Roles('INSTRUCTOR')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.studyRoomService.remove(id);
  }
}
