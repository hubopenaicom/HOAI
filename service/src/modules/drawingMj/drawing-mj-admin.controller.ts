import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { QueryAdminDrawingMjJobsDto } from './dto/queryAdminDrawingMjJobs.dto';
import { DrawingMjJobService } from './drawing-mj-job.service';

@ApiTags('drawing-mj-admin')
@Controller('drawing/mj/admin')
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class DrawingMjAdminController {
  constructor(private readonly drawingMjJobService: DrawingMjJobService) {}

  @Get('jobs')
  @ApiOperation({ summary: '后台：分页查询用户 MJ 绘画任务（含用户信息）' })
  async adminListJobs(@Query() query: QueryAdminDrawingMjJobsDto, @Req() req: Request) {
    return this.drawingMjJobService.adminQueryJobs(query, req);
  }
}
