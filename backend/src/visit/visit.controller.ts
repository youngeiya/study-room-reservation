import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CancelVisitDto } from './dto/cancel-visit.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { VisitHistoryView, VisitReservation, VisitView } from './visit.entity';
import { VisitService } from './visit.service';

/** 경로가 자습실·신청·학생에 걸쳐 있어서 클래스 prefix 없이 메서드마다 전체 경로를 적는다. */
@Controller()
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  // POST /api/study-rooms/1/visits : 방문 신청
  @Post('study-rooms/:roomId/visits')
  create(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: CreateVisitDto,
  ): Promise<VisitReservation> {
    return this.visitService.create(roomId, dto);
  }

  // PATCH /api/visits/1 : 방문 시간 수정
  @Patch('visits/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVisitDto,
  ): Promise<VisitReservation> {
    return this.visitService.update(id, dto);
  }

  // POST /api/visits/1/cancel : 방문 취소 (새로 만드는 게 아니라 상태 변경이라 200)
  @Post('visits/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelVisitDto,
  ): Promise<VisitReservation> {
    return this.visitService.cancel(id, dto);
  }

  // GET /api/study-rooms/1/histories : 신청·수정·취소 이력 (시간순)
  @Get('study-rooms/:roomId/histories')
  findHistories(
    @Param('roomId', ParseIntPipe) roomId: number,
  ): Promise<VisitHistoryView[]> {
    return this.visitService.findHistories(roomId);
  }

  // GET /api/students/1/visits : 학생 본인의 신청 목록
  @Get('students/:studentId/visits')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
  ): Promise<VisitView[]> {
    return this.visitService.findByStudent(studentId);
  }
}
