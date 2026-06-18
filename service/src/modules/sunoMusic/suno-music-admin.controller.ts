import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { QueryAdminSunoMusicJobsDto } from './dto/queryAdminSunoMusicJobs.dto';
import { SunoMusicJobService } from './suno-music-job.service';

@ApiTags('suno-music-admin')
@Controller('music/suno/admin')
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class SunoMusicAdminController {
  constructor(private readonly sunoMusicJobService: SunoMusicJobService) {}

  @Get('jobs')
  @ApiOperation({ summary: '后台：分页查询 Suno 音乐任务' })
  async adminListJobs(@Query() query: QueryAdminSunoMusicJobsDto, @Req() req: Request) {
    return this.sunoMusicJobService.adminQueryJobs(query, req);
  }
}
