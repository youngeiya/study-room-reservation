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
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { BusinessException } from '../common/business.exception';
import { CreateVisitBodyDto, UpdateVisitBodyDto } from './dto/visit-body.dto';
import { VisitHistoryView, VisitReservation, VisitView } from './visit.entity';
import { VisitService } from './visit.service';

/**
 * 경로가 자습실·신청·학생에 걸쳐 있어서 클래스 prefix 없이 메서드마다 전체 경로를 적는다.
 *
 * 로그인이 생겨서, 신청·수정·취소의 "누가"는 요청 body 가 아니라 **로그인한 학생(토큰)** 에서 가져온다.
 * (body 로 studentId 를 받으면 남의 이름으로 신청할 수 있기 때문이다.)
 */
@Controller()
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  // POST /api/study-rooms/1/visits : 방문 신청 (학생)
  @Roles('STUDENT')
  @Post('study-rooms/:roomId/visits')
  create(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: CreateVisitBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<VisitReservation> {
    return this.visitService.create(roomId, {
      studentId: user.id,
      visitAt: dto.visitAt,
    });
  }

  // PATCH /api/visits/1 : 방문 시간 수정 (학생, 본인 신청만 - 서비스가 소유자를 확인한다)
  @Roles('STUDENT')
  @Patch('visits/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVisitBodyDto,
    @CurrentUser() user: AuthUser,
  ): Promise<VisitReservation> {
    return this.visitService.update(id, {
      studentId: user.id,
      visitAt: dto.visitAt,
    });
  }

  // POST /api/visits/1/cancel : 방문 취소 (새로 만드는 게 아니라 상태 변경이라 200)
  @Roles('STUDENT')
  @Post('visits/:id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ): Promise<VisitReservation> {
    return this.visitService.cancel(id, { studentId: user.id });
  }

  // GET /api/study-rooms/1/histories : 신청·수정·취소 이력 (강사)
  @Roles('INSTRUCTOR')
  @Get('study-rooms/:roomId/histories')
  findHistories(
    @Param('roomId', ParseIntPipe) roomId: number,
  ): Promise<VisitHistoryView[]> {
    return this.visitService.findHistories(roomId);
  }

  // GET /api/students/1/visits : 학생의 신청 목록. 학생은 본인 것만, 강사는 누구 것이든 볼 수 있다.
  @Get('students/:studentId/visits')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<VisitView[]> {
    if (user.role === 'STUDENT' && user.id !== studentId) {
      throw new BusinessException('FORBIDDEN'); // 다른 학생의 신청은 볼 수 없다
    }
    return this.visitService.findByStudent(studentId);
  }
}
