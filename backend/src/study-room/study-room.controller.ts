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
import { StudyRoom, StudyRoomView } from './study-room.entity';
import { StudyRoomService } from './study-room.service';

@Controller('study-rooms')
export class StudyRoomController {
  constructor(private readonly studyRoomService: StudyRoomService) {}

  @Get()
  findAll(): Promise<StudyRoomView[]> {
    return this.studyRoomService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<StudyRoomView> {
    return this.studyRoomService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStudyRoomDto): Promise<StudyRoom> {
    return this.studyRoomService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudyRoomDto,
  ): Promise<StudyRoom> {
    return this.studyRoomService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.studyRoomService.remove(id);
  }
}
