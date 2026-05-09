import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { UserBalanceService } from '@/modules/userBalance/userBalance.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { DrawingMjJobEntity } from './drawing-mj-job.entity';
import {
  CreateDrawingMjJobDto,
  DrawingMjJobService,
} from './drawing-mj-job.service';
import { DrawingMjService, MjSpeedMode } from './drawing-mj.service';

@ApiTags('drawing-mj')
@Controller('drawing/mj')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DrawingMjController {
  constructor(
    private readonly drawingMjService: DrawingMjService,
    private readonly drawingMjJobService: DrawingMjJobService,
    private readonly userBalanceService: UserBalanceService,
  ) {}

  @Get('proxy-image')
  @ApiOperation({ summary: '代理下载远程图片（前端另存为，服务端拉取绕开浏览器跨域）' })
  @Header('Cache-Control', 'no-store')
  async proxyImageDownload(@Query('url') url?: string) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new BadRequestException('缺少参数 url');
    }
    const out = await this.drawingMjService.proxyFetchImage(url.trim());
    const safeName = out.filename.replace(/[^\w.\-()+[\]]/g, '_') || 'image.png';
    return new StreamableFile(out.buffer, {
      type: out.contentType,
      disposition: `attachment; filename="${safeName}"`,
    });
  }

  private mjJobEntityToDto(e: DrawingMjJobEntity) {
    let task: Record<string, unknown> | undefined;
    try {
      if (e.taskJson) task = JSON.parse(e.taskJson) as Record<string, unknown>;
    } catch {
      task = undefined;
    }
    const ck = e.clientKey ? Number(e.clientKey) : undefined;
    return {
      id: e.id,
      clientKey: Number.isFinite(ck as number) ? ck : undefined,
      taskId: e.taskId ?? '',
      modelKey: e.modelKey,
      mjMode: e.mjMode as MjSpeedMode,
      mjStyleSnapshot: e.mjStyleSnapshot ?? undefined,
      promptLabel: e.promptLabel,
      loading: !!e.loading,
      error: e.error ?? undefined,
      task,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  @Get('jobs')
  @ApiOperation({ summary: '列举当前账号的 MJ 绘画任务（云端，可跨设备）' })
  async listMjJobs(@Req() req: Request, @Query('limit') limit?: string) {
    const lim = Math.min(100, Math.max(1, parseInt(String(limit || '80'), 10) || 80));
    const rows = await this.drawingMjJobService.listForUser(req.user.id, lim);
    return { list: rows.map(r => this.mjJobEntityToDto(r)) };
  }

  @Post('jobs/batch-upsert')
  @ApiOperation({ summary: '批量同步 MJ 任务快照（按 clientKey 与账号幂等合并）' })
  async batchUpsertMjJobs(@Req() req: Request, @Body() body: { jobs?: CreateDrawingMjJobDto[] }) {
    const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
    const n = await this.drawingMjJobService.batchUpsert(req.user.id, jobs);
    return { synced: n };
  }

  /** 校验余额 → 调用上游 → 成功码扣费 → 返回上游 JSON body */
  private async withBalance(
    req: Request,
    row: any,
    charge:
      | string
      | {
          /** 相对模型单次 deduct 的倍数 */
          mult: number;
        },
    fn: () => Promise<{ status: number; data: any }>,
  ) {
    const mult =
      typeof charge === 'string'
        ? this.drawingMjService.guessChargeMultiplier(charge || '')
        : charge.mult;
    const amount = Number(row.deduct) * mult;
    await this.userBalanceService.validateBalance(req, row.deductType, amount);
    const out = await fn();
    const payload = out?.data;
    const raw = payload?.code;
    const code =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : typeof raw === 'string' && raw.trim() !== ''
          ? Number(raw.trim())
          : NaN;
    if (
      !Number.isNaN(code) &&
      (code === 0 || code === 1 || code === 21 || code === 22)
    ) {
      await this.userBalanceService.deductFromBalance(req.user.id, row.deductType, amount);
    }
    return payload;
  }

  @Post('submit/imagine')
  @ApiOperation({ summary: 'MJ Imagine（文生图 / 垫图）' })
  async imagine(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      prompt: string;
      base64Array?: string[];
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, body.prompt || '', () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/imagine', {
        data: {
          prompt: body.prompt,
          base64Array: body.base64Array,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('submit/change')
  @ApiOperation({ summary: 'MJ U/V/R（change）' })
  async change(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      action: string;
      index?: number;
      taskId: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/change', {
        data: {
          action: body.action,
          index: body.index,
          taskId: body.taskId,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('submit/action')
  @ApiOperation({ summary: 'MJ 自定义按钮（customId）' })
  async action(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      customId: string;
      taskId: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/action', {
        data: {
          customId: body.customId,
          taskId: body.taskId,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('submit/simple-change')
  @ApiOperation({ summary: 'MJ simple-change（如 taskId U2）' })
  async simpleChange(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      content: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/simple-change', {
        data: {
          content: body.content,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('submit/blend')
  @ApiOperation({ summary: 'MJ Blend 混合图' })
  async blend(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      base64Array: string[];
      dimensions?: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, { mult: 4 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/blend', {
        data: {
          base64Array: body.base64Array,
          dimensions: body.dimensions,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('submit/describe')
  @ApiOperation({ summary: 'MJ Describe 图生文' })
  async describe(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      base64: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/describe', {
        data: {
          base64: body.base64,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('submit/modal')
  @ApiOperation({ summary: 'MJ Modal（局部重绘 / Zoom）' })
  async modal(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      taskId: string;
      prompt?: string;
      maskBase64?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/modal', {
        data: {
          taskId: body.taskId,
          prompt: body.prompt,
          maskBase64: body.maskBase64,
        },
      }),
    );
  }

  @Post('submit/shorten')
  @ApiOperation({ summary: 'MJ Shorten 提示词分析' })
  async shorten(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      prompt: string;
      botType?: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    return this.withBalance(req, row, body.prompt || '', () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/shorten', {
        data: {
          prompt: body.prompt,
          botType: body.botType,
          notifyHook: body.notifyHook,
          state: body.state,
        },
      }),
    );
  }

  @Post('task/list-by-condition')
  @ApiOperation({ summary: 'MJ 按 ID 列表查任务' })
  async taskList(@Body() body: { model: string; mjMode?: MjSpeedMode; ids?: string[] }) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    const out = await this.drawingMjService.requestUpstream(row, mode, '/task/list-by-condition', {
      data: { ids: body.ids || [] },
    });
    return out.data;
  }

  @Get('task/:id/fetch')
  @ApiOperation({ summary: 'MJ 查询单个任务（含按钮）' })
  async taskFetch(
    @Param('id') id: string,
    @Query('model') model: string,
    @Query('mjMode') mjMode: MjSpeedMode,
  ) {
    const row = await this.drawingMjService.resolveMjModel(model);
    const mode = mjMode || 'fast';
    const out = await this.drawingMjService.requestUpstream(
      row,
      mode,
      `/task/${encodeURIComponent(id)}/fetch`,
      {
        method: 'GET',
      },
    );
    return out.data;
  }

  @Get('task/:id/image-seed')
  @ApiOperation({ summary: 'MJ 获取任务 seed' })
  async imageSeed(
    @Param('id') id: string,
    @Query('model') model: string,
    @Query('mjMode') mjMode: MjSpeedMode,
  ) {
    const row = await this.drawingMjService.resolveMjModel(model);
    const mode = mjMode || 'fast';
    const out = await this.drawingMjService.requestUpstream(
      row,
      mode,
      `/task/${encodeURIComponent(id)}/image-seed`,
      {
        method: 'GET',
      },
    );
    return out.data;
  }
}
