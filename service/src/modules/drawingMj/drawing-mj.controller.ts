import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { UserBalanceService } from '@/modules/userBalance/userBalance.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Logger,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { DrawingMjJobEntity } from './drawing-mj-job.entity';
import { CreateDrawingMjJobDto, DrawingMjJobService } from './drawing-mj-job.service';
import { DrawingMjService, MjSpeedMode } from './drawing-mj.service';

/** 蒙版转发格式；`passthrough` = trim 后原样上传（调试用） */
type MjModalMaskFmt = 'raw' | 'dataurl' | 'passthrough';

/**
 * 蒙版：参考 xifan `CanvasMask` —— 前端多为 `data:image/png;base64,...`；部分 OpenAPI 仅接受裸 Base64。
 * - 显式：`MJ_MODAL_MASK_FORMAT=raw|dataurl|passthrough`；或 `MJ_MODAL_MASK_DATAURL=1` / `MJ_MODAL_MASK_RAW=1`。
 * - 默认 **auto**：统一按 **raw** 送上游（剥掉 `data:image/...;base64,`）。多数 OpenAPI / proxy-plus 对 `maskBase64` 只校验裸 base64，带前缀易报「无效参数」。需保留前缀的网关请设 `MJ_MODAL_MASK_FORMAT=dataurl`。
 */
function resolveMjModalMaskFormat(_maskIn?: string): MjModalMaskFmt {
  const v = process.env.MJ_MODAL_MASK_FORMAT?.trim().toLowerCase();
  if (v === 'raw' || v === 'dataurl' || v === 'passthrough') return v;
  if (process.env.MJ_MODAL_MASK_DATAURL === '1') return 'dataurl';
  if (process.env.MJ_MODAL_MASK_RAW === '1') return 'raw';
  return 'raw';
}

/**
 * Modal 上游 Body：许多 OpenAPI 仅声明 `taskId` + 可选 `prompt` / `maskBase64`，多传字段易报「无效参数」。
 * 默认只转发这三项（与具体代理域名无关）。若某聚合仍需 `notifyHook` / `state` / `mode` / `noStorage`，设 `MJ_MODAL_FORWARD_EXTRAS=1`。
 */
function mjModalForwardExtrasToUpstream(): boolean {
  return process.env.MJ_MODAL_FORWARD_EXTRAS === '1';
}

function normalizeMjModalMaskForUpstream(
  raw: string | undefined,
  format: MjModalMaskFmt,
): string | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  if (format === 'passthrough') {
    const t = raw.trim().replace(/\s+/g, '');
    return t || undefined;
  }
  let s = raw.trim().replace(/\s+/g, '');
  if (!s) return undefined;
  if (format === 'dataurl') {
    if (/^data:image\/[^;]+;base64,/i.test(s)) return s;
    return `data:image/png;base64,${s}`;
  }
  const stripped = s.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (stripped) return stripped[1] || undefined;
  return s || undefined;
}

function mjModalMaskPayloadIsPng(mask: string): boolean {
  let b64 = mask;
  const m = mask.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (m) b64 = m[1];
  try {
    const buf = Buffer.from(b64, 'base64');
    return (
      buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    );
  } catch {
    return false;
  }
}

@ApiTags('drawing-mj')
@Controller('drawing/mj')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DrawingMjController {
  private readonly logger = new Logger(DrawingMjController.name);

  constructor(
    private readonly drawingMjService: DrawingMjService,
    private readonly drawingMjJobService: DrawingMjJobService,
    private readonly userBalanceService: UserBalanceService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private async getMjJobsSyncSeq(userId: number): Promise<number> {
    const u = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'mjJobsSyncSeq'],
    });
    return Number(u?.mjJobsSyncSeq ?? 0);
  }

  /** 删除成功后递增，防止晚到的 batch-upsert 用旧快照复活记录 */
  private async bumpMjJobsSyncSeq(userId: number): Promise<number> {
    await this.userRepo.increment({ id: userId }, 'mjJobsSyncSeq', 1);
    return this.getMjJobsSyncSeq(userId);
  }

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
    const syncSeq = await this.getMjJobsSyncSeq(req.user.id);
    return { list: rows.map(r => this.mjJobEntityToDto(r)), syncSeq };
  }

  @Post('jobs/batch-upsert')
  @ApiOperation({ summary: '批量同步 MJ 任务快照（按 clientKey 与账号幂等合并）' })
  async batchUpsertMjJobs(
    @Req() req: Request,
    @Body() body: { jobs?: CreateDrawingMjJobDto[]; baseSyncSeq?: number },
  ) {
    const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
    const uid = req.user.id;
    const serverSeq = await this.getMjJobsSyncSeq(uid);
    const clientSeq = body?.baseSyncSeq;
    if (clientSeq !== undefined && clientSeq !== null && String(clientSeq) !== '') {
      const c = Number(clientSeq);
      if (Number.isFinite(c) && c !== serverSeq) {
        return { synced: 0, stale: true as const, syncSeq: serverSeq };
      }
    }
    const n = await this.drawingMjJobService.batchUpsert(uid, jobs);
    return { synced: n, syncSeq: serverSeq };
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: '删除当前账号下的 MJ 绘画任务记录（云端列表）' })
  async deleteMjJob(@Req() req: Request, @Param('id') id: string) {
    const nid = parseInt(String(id || '').trim(), 10);
    if (!Number.isFinite(nid) || nid < 1) {
      throw new BadRequestException('无效的任务 id');
    }
    await this.drawingMjJobService.delete(req.user.id, nid);
    const syncSeq = await this.bumpMjJobsSyncSeq(req.user.id);
    return { ok: true, syncSeq };
  }

  /** 校验余额 → 调用上游 → 成功码扣费 → 返回上游 JSON body */
  private async withBalance(
    req: Request,
    row: any,
    mjMode: MjSpeedMode,
    charge:
      | string
      | {
          /** 相对 MJ 单次基准扣费的倍数 */
          mult: number;
        },
    fn: () => Promise<{ status: number; data: any }>,
  ) {
    const mult =
      typeof charge === 'string'
        ? this.drawingMjService.guessChargeMultiplier(charge || '')
        : charge.mult;
    const base = this.drawingMjService.mjBaseDeductPerUnit(row, mjMode);
    const amount = base * mult;
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
    if (!Number.isNaN(code) && (code === 0 || code === 1 || code === 21 || code === 22)) {
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
    return this.withBalance(req, row, mode, body.prompt || '', () =>
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
    return this.withBalance(req, row, mode, { mult: 1 }, () =>
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
      /** DMX 1.2：mj / niji；部分聚合对缺省敏感 */
      botType?: string;
      enableRemix?: boolean;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    /** 常见 OpenAPI：action 仅 customId、taskId、notifyHook、state；多字段可能被 strict schema 判无效参数 */
    const actionData: Record<string, unknown> = {
      customId: body.customId,
      taskId: body.taskId,
    };
    const nh = body.notifyHook != null ? String(body.notifyHook).trim() : '';
    if (nh) actionData.notifyHook = nh;
    const st = body.state != null ? String(body.state).trim() : '';
    if (st) actionData.state = st;
    if (process.env.MJ_ACTION_FORWARD_EXTRAS === '1') {
      if (body.botType != null && String(body.botType).trim() !== '') {
        actionData.botType = String(body.botType).trim();
      }
      if (body.enableRemix === true) actionData.enableRemix = true;
    }
    return this.withBalance(req, row, mode, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/action', {
        data: actionData,
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
    return this.withBalance(req, row, mode, { mult: 1 }, () =>
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
    return this.withBalance(req, row, mode, { mult: 4 }, () =>
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
    return this.withBalance(req, row, mode, { mult: 1 }, () =>
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
      /** DMX 等：true 时返回原始图链 */
      noStorage?: boolean;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    const taskId = String(body.taskId ?? '').trim();
    if (!taskId) {
      throw new BadRequestException('缺少 taskId');
    }
    const maskFmt = resolveMjModalMaskFormat(body.maskBase64);
    const rawMaskIn = body.maskBase64;
    const rawLen = rawMaskIn != null && typeof rawMaskIn === 'string' ? rawMaskIn.trim().length : 0;
    let mask = normalizeMjModalMaskForUpstream(body.maskBase64, maskFmt);
    if (rawLen > 80 && !mask) {
      throw new BadRequestException(
        '蒙版无法解析（可能被网关截断 JSON，请调大 Nginx client_max_body_size 或缩小选区）',
      );
    }
    if (mask && !mjModalMaskPayloadIsPng(mask)) {
      this.logger.log(
        `[MJ modal] 蒙版解码后非标准 PNG 文件头，仍尝试提交上游（若失败请检查选区/图片源）`,
      );
    }
    const promptStr =
      body.prompt != null && String(body.prompt).trim() !== '' ? String(body.prompt).trim() : '';
    /**
     * midjourney-proxy-plus / 常见 MJ 代理文档：modal 的 prompt「为空时使用原任务的 prompt」。
     * 有蒙版时也不要强行塞占位词，否则会覆盖上游应继承的原文，易触发无效参数或关窗失败。
     * 若某聚合仍要求非空，可设 `MJ_MODAL_EMPTY_PROMPT_FALLBACK` 恢复占位行为。
     */
    let effectivePrompt = promptStr;
    if (mask && !effectivePrompt && process.env.MJ_MODAL_EMPTY_PROMPT_FALLBACK?.trim()) {
      effectivePrompt = process.env.MJ_MODAL_EMPTY_PROMPT_FALLBACK.trim();
    }
    /**
     * OpenAPI：prompt 可选，空则沿用原任务；**不要传 prompt:""**，部分网关会把空串判为无效参数。
     */
    const forwardExtras = mjModalForwardExtrasToUpstream();
    const data: Record<string, unknown> = { taskId };
    if (mask) {
      if (effectivePrompt !== '') data.prompt = effectivePrompt;
      data.maskBase64 = mask;
      /** 个别网关读 `mask` 而非 `maskBase64`，且禁止多余字段时不要设。例：`MJ_MODAL_MASK_DUP_KEY=mask` */
      const dupK = process.env.MJ_MODAL_MASK_DUP_KEY?.trim();
      if (dupK && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dupK)) {
        data[dupK] = mask;
      }
    } else if (effectivePrompt !== '') {
      data.prompt = effectivePrompt;
    }
    /**
     * 部分聚合（DMX / ephone 等）在 Modal 要求 body.mode，且与是否转发 notifyHook 无关。
     * 设 `MJ_MODAL_APPEND_MODE=1` 即附加，勿与 `MJ_MODAL_FORWARD_EXTRAS` 绑死。
     */
    if (process.env.MJ_MODAL_APPEND_MODE === '1') {
      /** DMX 等：常见为 RELAX / FAST；turbo 通道多仍标为 FAST。若上游要 TURBO 字面量可设 `MJ_MODAL_MODE_TURBO_LITERAL=1`。 */
      const turboLit = process.env.MJ_MODAL_MODE_TURBO_LITERAL === '1';
      data.mode = mode === 'relax' ? 'RELAX' : mode === 'turbo' && turboLit ? 'TURBO' : 'FAST';
    }
    if (forwardExtras) {
      if (typeof body.noStorage === 'boolean') {
        data.noStorage = body.noStorage;
      }
      const nh = body.notifyHook != null ? String(body.notifyHook).trim() : '';
      if (nh) data.notifyHook = nh;
      const st = body.state != null ? String(body.state).trim() : '';
      if (st) data.state = st;
    }
    /** 与 submit/action、task/fetch 使用同一 mj 前缀，保证 code=21 的 taskId 与通道一致。仅当上游只在标准 `/mj` 挂了 modal 时再设 `MJ_MODAL_FORCE_FAST_MJ_PATH=1`。 */
    const upstreamMode: MjSpeedMode =
      process.env.MJ_MODAL_FORCE_FAST_MJ_PATH === '1' ? 'fast' : mode;
    this.logger.log(
      `[MJ modal] forwardExtras=${forwardExtras} maskFmt=${maskFmt} upstreamMode=${upstreamMode} taskId.len=${
        taskId.length
      } prompt.len=${effectivePrompt.length} rawMask.len=${rawLen} outMask.len=${
        mask?.length ?? 0
      } reqMjMode=${mode}`,
    );
    return this.withBalance(req, row, upstreamMode, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, upstreamMode, '/submit/modal', {
        data,
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
    return this.withBalance(req, row, mode, body.prompt || '', () =>
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
