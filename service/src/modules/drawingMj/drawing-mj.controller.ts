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
import { isPresetOutpaintCustomId, stripMjModelVersionFlags } from './mj-outpaint-cz';
import { proxyUrlMatchesMjHostMarkers } from './mj-proxy-host-markers';
import { UploadService } from '../upload/upload.service';
import { DrawingMjService, MjSpeedMode } from './drawing-mj.service';

/** 蒙版转发格式；`passthrough` = trim 后原样上传（调试用） */
type MjModalMaskFmt = 'raw' | 'dataurl' | 'passthrough';

/**
 * 蒙版：参考 xifan `CanvasMask` —— 前端多为 `data:image/png;base64,...`；部分 OpenAPI 仅接受裸 Base64。
 * - 显式：`MJ_MODAL_MASK_FORMAT=raw|dataurl|passthrough`；或 `MJ_MODAL_MASK_DATAURL=1` / `MJ_MODAL_MASK_RAW=1`。
 * - 默认 **auto**：统一按 **raw** 送上游（剥掉 `data:image/...;base64,`）。多数 OpenAPI 对 `maskBase64` 只校验裸 base64，带前缀易报「无效参数」。需保留前缀的网关请设 `MJ_MODAL_MASK_FORMAT=dataurl`。
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

/**
 * 前端多为 `data:image/...;base64,...`。
 * `MJ_SUBMIT_IMAGE_BASE64_FORMAT=raw|dataurl|passthrough`，未设置时默认 **raw**（剥前缀）。
 * Blend 见 `resolveMjBlendSubmitBase64Format`（多数 OpenAPI 要求每项为完整 Data URL）。
 */
function resolveMjSubmitImageBase64Format(): MjModalMaskFmt {
  const v = process.env.MJ_SUBMIT_IMAGE_BASE64_FORMAT?.trim().toLowerCase();
  if (v === 'raw' || v === 'dataurl' || v === 'passthrough') return v;
  return 'raw';
}

/**
 * Blend：`base64Array` 在部分聚合网关上常要求 **每项为完整 Data URL**；
 * 仅送裸 base64 时提交可成功，任务阶段易报 `invalid_parameter`（提示词格式错误）。
 * `MJ_BLEND_IMAGE_BASE64_FORMAT=raw|dataurl|passthrough`；未设置时默认 **dataurl**。
 */
function resolveMjBlendSubmitBase64Format(): MjModalMaskFmt {
  const v = process.env.MJ_BLEND_IMAGE_BASE64_FORMAT?.trim().toLowerCase();
  if (v === 'raw' || v === 'dataurl' || v === 'passthrough') return v;
  return 'dataurl';
}

/** 裸 base64 补 Data URL 前缀时按魔数识别 MIME，避免 JPEG 误标成 PNG 导致上游校验失败 */
function guessImageDataUrlPrefixForRawBase64(b64: string): string {
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'data:image/jpeg;base64,';
    }
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return 'data:image/png;base64,';
    }
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'data:image/webp;base64,';
    }
    if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return 'data:image/gif;base64,';
    }
    if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
      return 'data:image/bmp;base64,';
    }
  } catch {
    /* ignore */
  }
  return 'data:image/png;base64,';
}

/**
 * 已有 `data:image/...;base64,` 时仍按魔数校正声明的 MIME，避免 JPEG/WebP 被误标为 PNG 导致上游执行期 invalid_parameter。
 */
function alignDataUrlImageMimeFromMagicBytes(s: string): string {
  const m = s.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!m) return s;
  const declared = m[1].toLowerCase();
  const b64 = m[2];
  try {
    const prefix = guessImageDataUrlPrefixForRawBase64(b64);
    const cm = prefix.match(/^data:(image\/[^;]+);base64,$/i);
    const correct = cm?.[1]?.toLowerCase();
    if (correct && correct !== declared) {
      return `${prefix}${b64}`;
    }
  } catch {
    /* ignore */
  }
  return s;
}

/**
 * 部分代理：直连 Data URL 混图常在执行期 `invalid_parameter`；需先 `upload-discord-images` 再拉回图转 Data URL（见本模块实现）。
 * - `MJ_BLEND_VIA_DISCORD_UPLOAD=1|true|on`：任意上游都先上传
 * - `MJ_BLEND_VIA_DISCORD_UPLOAD=0|false|off|no`：关闭（含关闭内置自动检测）
 * - 未设置：proxyUrl 命中 `MJ_PROXY_HOST_MARKERS` 任一段时自动先上传
 */
function mjBlendUseDiscordUploadFirst(proxyUrl: string | undefined | null): boolean {
  const v = process.env.MJ_BLEND_VIA_DISCORD_UPLOAD?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return proxyUrlMatchesMjHostMarkers(proxyUrl);
}

/**
 * Blend 的 `botType`：全局可 `MJ_BLEND_OMIT_BOT_TYPE=1` 省略。
 * 当 proxyUrl 命中 `MJ_PROXY_HOST_MARKERS` 时，部分上游会因默认 `MID_JOURNEY` 与图链组合报 invalid_parameter，故**默认不传** botType；
 * 需要时由请求体带 `botType`，或设 `MJ_BLEND_BOT_TYPE`，或 `MJ_BLEND_EP_FORCE_BOT_TYPE=1` 恢复默认 MID_JOURNEY。
 */
function resolveMjBlendBotType(
  bodyBot: string | undefined,
  proxyUrl: string | undefined,
): string | undefined {
  if (process.env.MJ_BLEND_OMIT_BOT_TYPE === '1') return undefined;
  const fromEnv = process.env.MJ_BLEND_BOT_TYPE?.trim();
  if (fromEnv && /^(none|omit|off|0)$/i.test(fromEnv)) return undefined;
  const fromBody = bodyBot?.trim();
  if (fromBody) return fromBody;
  if (fromEnv) return fromEnv;
  const hostMatchesMarkers = proxyUrlMatchesMjHostMarkers(proxyUrl);
  if (hostMatchesMarkers && process.env.MJ_BLEND_EP_FORCE_BOT_TYPE !== '1') {
    return undefined;
  }
  return 'MID_JOURNEY';
}

function normalizeMjDataUrlOrRawString(
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
    if (/^data:image\/[^;]+;base64,/i.test(s)) return alignDataUrlImageMimeFromMagicBytes(s);
    return `${guessImageDataUrlPrefixForRawBase64(s)}${s}`;
  }
  const stripped = s.match(/^data:image\/[^;]+;base64,(.+)$/i);
  if (stripped) return stripped[1] || undefined;
  return s || undefined;
}

function normalizeMjModalMaskForUpstream(
  raw: string | undefined,
  format: MjModalMaskFmt,
): string | undefined {
  return normalizeMjDataUrlOrRawString(raw, format);
}

function normalizeMjSubmitBase64Array(
  arr: string[] | undefined,
  format: MjModalMaskFmt,
): string[] | undefined {
  if (!arr?.length) return undefined;
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const n = normalizeMjDataUrlOrRawString(x, format);
    if (n) out.push(n);
  }
  return out.length ? out : undefined;
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

/**
 * `--cref` / `--sref` / `--oref` 所需图链来源（与 {@link DrawingMjController.uploadRefCdnUrl} 一致）。
 * - `upstream`：仅调用上游 `submit/upload-discord-images`（Discord CDN）。
 * - `self`：仅写入本站已启用的存储（UploadService：本地需 siteUrl 或 PUBLIC_SITE_URL 等为公网 https；COS/OSS/S3 等）。
 * - `prefer_self`：先试本站，失败再回退上游（未配置 `MJ_REF_CDN_STRATEGY` 时服务端默认即为此策略，适配「仅开本地存储」）。
 * 环境变量 `MJ_REF_CDN_STRATEGY` 可设上述三值；请求体 `refStorage` 非空时优先生效。
 */
function resolveMjRefCdnUploadStrategy(refStorage?: string): 'upstream' | 'self' | 'prefer_self' {
  const q = refStorage?.trim().toLowerCase();
  if (q === 'self' || q === 'upstream' || q === 'prefer_self') return q;
  const env = process.env.MJ_REF_CDN_STRATEGY?.trim().toLowerCase();
  if (env === 'self' || env === 'upstream' || env === 'prefer_self') return env;
  /**
   * 未配置环境变量时：默认「先试本站存储（后台开启的本地 / COS / OSS 等），失败再回退上游 Discord 图床」。
   * 仅开本地存储、未设 MJ_REF_CDN_STRATEGY 时，若默认 upstream 则永远不会写入 public/file，前端会一直停留在 blob 预览。
   */
  return 'prefer_self';
}

/** 将 submit 用的 base64 项（裸 base64 或 data URL）解码为 Buffer，并给出 image/* MIME（供扩展名与 Content-Type） */
function mjRefImageBufferAndMimeFromSubmitString(item: string): {
  buffer: Buffer;
  mimetype: string;
} {
  const t = item.trim();
  const dm = /^data:(image\/[^;]+);base64,(.+)$/i.exec(t);
  if (dm) {
    return { buffer: Buffer.from(dm[2], 'base64'), mimetype: dm[1].toLowerCase() };
  }
  try {
    const buf = Buffer.from(t, 'base64');
    if (!buf.length) {
      throw new BadRequestException('参考图解码后为空');
    }
    const prefix = guessImageDataUrlPrefixForRawBase64(t);
    const cm = /^data:(image\/[^;]+);base64,$/i.exec(prefix);
    const mimetype = cm?.[1]?.toLowerCase() || 'image/png';
    return { buffer: buf, mimetype };
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('无法将参考图解码为图片数据');
  }
}

function assertHttpsUrlForMjRef(url: string): string {
  const u = String(url ?? '').trim();
  if (/^https:\/\//i.test(u)) return u;
  if (/^http:\/\//i.test(u)) {
    return `https://${u.slice(7)}`;
  }
  throw new BadRequestException(
    '本站生成的图链须为公网 https（请在后台将「站点地址」配为 https，或改用环境变量 MJ_REF_CDN_STRATEGY=upstream 仅走上游图床）',
  );
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
    private readonly uploadService: UploadService,
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

  @Post('upload/ref-cdn-url')
  @ApiOperation({
    summary:
      '上传参考图并返回 https 直链（--cref/--sref/--oref）。未配置 MJ_REF_CDN_STRATEGY 时默认 prefer_self：先试本站存储（本地/COS/OSS 等），失败再回退上游 upload-discord-images；亦可设 upstream|self 强制策略',
  })
  async uploadRefCdnUrl(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      base64: string;
      /** 覆盖环境变量 `MJ_REF_CDN_STRATEGY`：self | upstream | prefer_self */
      refStorage?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    const b64Fmt = resolveMjSubmitImageBase64Format();
    const one = normalizeMjDataUrlOrRawString(body.base64, b64Fmt);
    if (!one) {
      throw new BadRequestException('需要有效的图片 base64（解析后为空）');
    }
    const arr = normalizeMjSubmitBase64Array([one], b64Fmt);
    if (!arr?.length) {
      throw new BadRequestException('需要有效的图片 base64（解析后为空）');
    }

    const strategy = resolveMjRefCdnUploadStrategy(body.refStorage);
    const { buffer, mimetype } = mjRefImageBufferAndMimeFromSubmitString(arr[0]);

    const uploadUpstream = async (): Promise<string> => {
      const urls = await this.drawingMjService.uploadDiscordImagesToCdnHttpsUrls(row, mode, arr);
      return urls[0];
    };

    const uploadSelf = async (): Promise<string> => {
      const safeMime = mimetype.startsWith('image/') ? mimetype : 'image/jpeg';
      const rawUrl = await this.uploadService.uploadFile(
        { buffer, mimetype: safeMime },
        'drawing/mj-ref',
        req.user,
      );
      return assertHttpsUrlForMjRef(String(rawUrl));
    };

    if (strategy === 'self') {
      const url = await uploadSelf();
      return { url, refSource: 'self' as const };
    }
    if (strategy === 'upstream') {
      const url = await uploadUpstream();
      return { url, refSource: 'upstream' as const };
    }

    try {
      const url = await uploadSelf();
      return { url, refSource: 'self' as const };
    } catch (e) {
      this.logger.warn(
        `MJ 参考图本站存储未成功，回退上游图床: ${(e as Error)?.message ?? String(e)}`,
      );
      const url = await uploadUpstream();
      return { url, refSource: 'upstream' as const };
    }
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
      parentTaskId: e.parentTaskId ?? undefined,
      parentClientKey: e.parentClientKey ? Number(e.parentClientKey) : undefined,
      modelKey: e.modelKey,
      mjMode: e.mjMode as MjSpeedMode,
      mjStyleSnapshot: e.mjStyleSnapshot ?? undefined,
      promptLabel: e.promptLabel,
      loading: !!e.loading,
      error: e.error ?? undefined,
      task,
      deductCharged: e.deductCharged != null ? Number(e.deductCharged) : undefined,
      chargeMult: e.chargeMult != null ? Number(e.chargeMult) : undefined,
      deductTypeSnapshot: e.deductTypeSnapshot != null ? Number(e.deductTypeSnapshot) : undefined,
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
      await this.userBalanceService.deductFromBalance(
        req.user.id,
        row.deductType,
        amount,
        0,
        JSON.stringify({ scene: 'drawing_mj' }),
      );
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
    const b64Fmt = resolveMjSubmitImageBase64Format();
    const base64Array = normalizeMjSubmitBase64Array(body.base64Array, b64Fmt);
    return this.withBalance(req, row, mode, body.prompt || '', () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/imagine', {
        data: {
          prompt: body.prompt,
          base64Array,
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
    const cidRaw = String(body.customId || '');
    /** 部分代理上预设 Zoom Out 直连易执行期 invalid_parameter → 服务端改走 Custom Zoom + submit/modal（OpenAPI 最小字段） */
    if (
      isPresetOutpaintCustomId(cidRaw) &&
      this.drawingMjService.presetOutpaintCustomZoomEnabled(row)
    ) {
      return this.withBalance(req, row, mode, { mult: 1 }, () =>
        this.drawingMjService.submitPresetOutpaintViaCustomZoom(
          row,
          mode,
          String(body.taskId ?? '').trim(),
          cidRaw,
        ),
      );
    }
    /** 常见 OpenAPI：action 仅 customId、taskId、notifyHook、state；多字段可能被 strict schema 判无效参数 */
    /** 部分 Go 服务反序列化要求 taskId 为 JSON 字符串；传 number 会 400 */
    const actionData: Record<string, unknown> = {
      customId: body.customId,
      taskId: String(body.taskId ?? '').trim(),
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
      /** 可选：`MID_JOURNEY` | `NIJI_JOURNEY`；未传时用 `MJ_BLEND_BOT_TYPE` 或默认 MID_JOURNEY */
      botType?: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    const b64Fmt = resolveMjBlendSubmitBase64Format();
    let base64Array = normalizeMjSubmitBase64Array(body.base64Array, b64Fmt);
    if (!base64Array?.length) {
      throw new BadRequestException('Blend 需要有效的图片 base64（解析后为空）');
    }
    if (mjBlendUseDiscordUploadFirst(row.proxyUrl)) {
      base64Array = await this.drawingMjService.uploadDiscordImagesForBlend(row, mode, base64Array);
    }
    const dimensions = (body.dimensions && String(body.dimensions).trim()) || 'SQUARE';
    const botType = resolveMjBlendBotType(body.botType, row.proxyUrl);
    return this.withBalance(req, row, mode, { mult: 4 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/blend', {
        data: {
          base64Array,
          dimensions,
          ...(botType ? { botType } : {}),
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
    const b64Fmt = resolveMjSubmitImageBase64Format();
    const base64 = normalizeMjDataUrlOrRawString(body.base64, b64Fmt);
    if (!base64) {
      throw new BadRequestException('Describe 需要有效的图片 base64（解析后为空）');
    }
    return this.withBalance(req, row, mode, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/describe', {
        data: {
          base64,
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
     * 常见 Midjourney 代理文档：modal 的 prompt「为空时使用原任务的 prompt」。
     * 有蒙版时也不要强行塞占位词，否则会覆盖上游应继承的原文，易触发无效参数或关窗失败。
     * 若某聚合仍要求非空，可设 `MJ_MODAL_EMPTY_PROMPT_FALLBACK` 恢复占位行为。
     */
    let effectivePrompt = promptStr;
    if (mask && !effectivePrompt && process.env.MJ_MODAL_EMPTY_PROMPT_FALLBACK?.trim()) {
      effectivePrompt = process.env.MJ_MODAL_EMPTY_PROMPT_FALLBACK.trim();
    }
    /** Custom Zoom 的 modal prompt 常含 `--zoom`；同条里再带 `--v` 等时部分上游会失败（invalid_parameter） */
    if (effectivePrompt && /\s--zoom\s/i.test(effectivePrompt)) {
      effectivePrompt = stripMjModelVersionFlags(effectivePrompt);
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
     * 部分聚合网关在 Modal 要求 body.mode，且与是否转发 notifyHook 无关。
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

  /**
   * 部分聚合网关提供的「图 URL + 提示词 + 可选蒙版」编辑（与常见 OpenAPI 的 taskId+modal 流程不同）。
   * 上游路径：`POST {prefix}/submit/edits`，body：prompt、image（URL）、maskBase64?、notifyHook?
   * 若上游不支持该端点会 404，需换支持 edits 的供应商或仅用 submit/modal。
   */
  @Post('submit/edits')
  @ApiOperation({ summary: 'MJ Edits（图 URL + prompt + 可选蒙版，依赖上游支持）' })
  async edits(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      mjMode?: MjSpeedMode;
      prompt: string;
      /** 待编辑图 URL（Apifox 示例为 cdn.midjourney.com 等直链） */
      image: string;
      maskBase64?: string;
      notifyHook?: string;
      state?: string;
    },
  ) {
    const row = await this.drawingMjService.resolveMjModel(body.model);
    const mode = body.mjMode || 'fast';
    const prompt = String(body.prompt ?? '').trim();
    const image = String(body.image ?? '').trim();
    if (!prompt) {
      throw new BadRequestException('缺少 prompt');
    }
    if (!image) {
      throw new BadRequestException('缺少 image');
    }
    const maskFmt = resolveMjModalMaskFormat(body.maskBase64);
    const rawMaskIn = body.maskBase64;
    const rawLen = rawMaskIn != null && typeof rawMaskIn === 'string' ? rawMaskIn.trim().length : 0;
    const mask = normalizeMjModalMaskForUpstream(body.maskBase64, maskFmt);
    if (rawLen > 80 && !mask) {
      throw new BadRequestException(
        '蒙版无法解析（可能被网关截断 JSON，请调大 Nginx client_max_body_size 或缩小选区）',
      );
    }
    const data: Record<string, unknown> = { prompt, image };
    if (mask) {
      data.maskBase64 = mask;
      const dupK = process.env.MJ_MODAL_MASK_DUP_KEY?.trim();
      if (dupK && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dupK)) {
        data[dupK] = mask;
      }
    }
    const nh = body.notifyHook != null ? String(body.notifyHook).trim() : '';
    if (nh) {
      data.notifyHook = nh;
    }
    if (process.env.MJ_EDITS_FORWARD_EXTRAS === '1') {
      const st = body.state != null ? String(body.state).trim() : '';
      if (st) data.state = st;
    }
    this.logger.log(
      `[MJ edits] prompt.len=${prompt.length} image.len=${
        image.length
      } maskFmt=${maskFmt} rawMask.len=${rawLen} outMask.len=${mask?.length ?? 0}`,
    );
    return this.withBalance(req, row, mode, { mult: 1 }, () =>
      this.drawingMjService.requestUpstream(row, mode, '/submit/edits', {
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
