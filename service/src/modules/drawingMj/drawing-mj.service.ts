import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { Repository } from 'typeorm';
import { ModelsEntity } from '../models/models.entity';
import {
  buildCustomZoomModalPromptFromTask,
  isPresetOutpaintCustomId,
  mjTaskButtonCustomZoomCustomId,
  outpaintTargetZoomNumber,
  presetOutpaintCustomZoomEnabledForProxy,
  unwrapMjSubmitEnvelope,
  unwrapMjTaskFromFetchData,
} from './mj-outpaint-cz';
import { proxyUrlMatchesMjHostMarkers } from './mj-proxy-host-markers';

export type MjSpeedMode = 'fast' | 'turbo' | 'relax';

/** 部分 TrueAI / 聚合网关的 fast 通道为 `/mj-fast/mj` 而非 `/mj`，可通过环境变量覆盖 */
function mjApiPrefix(mode: MjSpeedMode): string {
  switch (mode) {
    case 'turbo':
      return '/mj-turbo/mj';
    case 'relax':
      return '/mj-relax/mj';
    default: {
      const o = process.env.MJ_API_PREFIX_FAST?.trim();
      if (o) return o.replace(/\/+$/, '');
      return '/mj';
    }
  }
}

function mjSafeUrlForLog(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

function mjSummarizePostBody(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const lk = k.toLowerCase();
    if (lk === 'prompt' && typeof v === 'string') {
      const s = v;
      out.prompt = s.length <= 260 ? s : `${s.slice(0, 260)}…`;
      /** 仅用于日志：由最终 prompt 字符串推断是否含各参数，并非独立请求体字段、也不会代替 prompt 发给上游 */
      out.promptMeta = {
        len: s.length,
        cref: /--cref\b/i.test(s),
        sref: /--sref\b/i.test(s),
        oref: /--oref\b/i.test(s),
        iw: /--iw\b/i.test(s),
        stylize: /\s--s\s+\d/.test(s),
        raw: /(^|\s)--raw\b/i.test(s) || /(^|\s)--style\s+raw\b/i.test(s),
        draft: /--draft\b/i.test(s),
        hd: /(^|\s)--hd\b/i.test(s),
        sd: /(^|\s)--sd\b/i.test(s),
        cw: /--cw\b/i.test(s),
        sw: /--sw\b/i.test(s),
        ow: /--ow\b/i.test(s),
      };
      continue;
    }
    if (lk === 'base64array' && Array.isArray(v)) {
      const arr = v as unknown[];
      const lens = arr.map(x => (typeof x === 'string' ? x.length : 0));
      const total = lens.reduce((a, b) => a + b, 0);
      out.base64Array = {
        count: arr.length,
        totalChars: total,
        firstLens: lens.slice(0, 3),
      };
      continue;
    }
    if (typeof v === 'string') {
      if (lk.includes('base64') || lk === 'mask' || v.length > 240) {
        out[k] = `<string len=${v.length}>`;
      } else {
        out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mjSummarizeResponseBody(data: unknown): unknown {
  if (data == null) return data;
  if (typeof data !== 'object' || Array.isArray(data)) {
    return typeof data === 'string' ? data.slice(0, 400) : data;
  }
  const o = data as Record<string, unknown>;
  const snap: Record<string, unknown> = {};
  for (const k of [
    'code',
    'description',
    'message',
    'msg',
    'status',
    'title',
    'failReason',
    'failMsg',
  ]) {
    if (k in o && o[k] != null) snap[k] = o[k];
  }
  if ('result' in o) {
    const r = o.result;
    if (typeof r === 'string')
      snap.result = r.length > 64 ? `${r.slice(0, 64)}…(len=${r.length})` : r;
    else snap.result = r;
  }
  if ('data' in o && o.data != null && typeof o.data === 'object') {
    snap.nestedData = mjSummarizeResponseBody(o.data);
  }
  return Object.keys(snap).length ? snap : JSON.stringify(data).slice(0, 500);
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** 按魔数得到 Data URL 前缀（与 drawing-mj.controller 中 Blend 校正逻辑一致） */
function mjDataUrlPrefixFromImageBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'data:image/jpeg;base64,';
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
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
  return 'data:image/png;base64,';
}

/**
 * MJ 上游 base（proxyUrl）：去首尾空白与尾部斜杠。
 * 喜番参考实现为 `join(proxyUrl, '/mj/submit/...')`；若后台误填 `https://host/mj`，再拼前缀会得到 `/mj/mj/...`，上游常 404 或报「无效参数」。
 * 因此当路径**最后一段**为 `mj` 时去掉该段（`https://host/api/mj` → `https://host/api`）。
 */
function normalizeMjProxyBaseUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return '';
  if (url.endsWith('/')) url = url.slice(0, -1);
  try {
    const u = new URL(url);
    const pathname = (u.pathname || '/').replace(/\/+$/, '');
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === 'mj') {
      parts.pop();
      u.pathname = parts.length ? `/${parts.join('/')}` : '/';
      let out = u.toString();
      if (out.endsWith('/')) out = out.slice(0, -1);
      return out;
    }
  } catch {
    if (/\/mj$/i.test(url)) return url.replace(/\/mj$/i, '');
  }
  return url;
}

@Injectable()
export class DrawingMjService {
  constructor(
    @InjectRepository(ModelsEntity)
    private readonly modelsEntity: Repository<ModelsEntity>,
  ) {}

  /** 校验：启用且 drawingType=3（Midjourney） */
  async resolveMjModel(modelKey: string): Promise<ModelsEntity> {
    if (!modelKey) {
      throw new HttpException('缺少模型参数 model', HttpStatus.BAD_REQUEST);
    }
    const row = await this.modelsEntity.findOne({
      where: { model: modelKey },
    });
    if (!row || !row.status) {
      throw new HttpException('模型不存在或未启用', HttpStatus.BAD_REQUEST);
    }
    if (Number(row.drawingType) !== 3) {
      throw new HttpException(
        '当前模型不是 Midjourney 绘画类型（drawingType=3）',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!row.proxyUrl || !String(row.proxyUrl).trim()) {
      throw new HttpException('模型未配置上游地址 proxyUrl', HttpStatus.BAD_REQUEST);
    }
    return row;
  }

  /**
   * 对话侧走 MJ 上游：优先 drawingType=3；兼容历史模型标识 midjourney（需已配置 proxyUrl）
   */
  async resolveMjModelForChat(modelKey: string): Promise<ModelsEntity> {
    if (!modelKey) {
      throw new HttpException('缺少模型参数 model', HttpStatus.BAD_REQUEST);
    }
    const row = await this.modelsEntity.findOne({
      where: { model: modelKey },
    });
    if (!row || !row.status) {
      throw new HttpException('模型不存在或未启用', HttpStatus.BAD_REQUEST);
    }
    if (!row.proxyUrl || !String(row.proxyUrl).trim()) {
      throw new HttpException('模型未配置上游地址 proxyUrl', HttpStatus.BAD_REQUEST);
    }
    const dt = Number(row.drawingType);
    const legacyMj = String(row.model).toLowerCase() === 'midjourney';
    if (dt !== 3 && !legacyMj) {
      throw new HttpException(
        '对话使用 Midjourney 请在后台将「绘画类型」设为 Midjourney（drawingType=3），或与绘画页使用同一 MJ 模型',
        HttpStatus.BAD_REQUEST,
      );
    }
    return row;
  }

  async requestUpstream(
    row: ModelsEntity,
    mode: MjSpeedMode,
    pathAfterPrefix: string,
    options: { method?: 'GET' | 'POST'; data?: any; params?: any },
  ) {
    const base = normalizeMjProxyBaseUrl(row.proxyUrl);
    const prefix = mjApiPrefix(mode);
    const url = joinUrl(base, joinUrl(prefix, pathAfterPrefix));
    const headers: Record<string, string> = {};
    if (row.key) {
      /**
       * xifanai-AIweb midjourneyDraw 仅用 `mj-api-secret`（见该仓库 service 模块）。
       * - 默认：`Authorization: Bearer`（TrueAI / 多数聚合）
       * - `MJ_UPSTREAM_AUTH=secret`：仅 `mj-api-secret`（对齐喜番/xifan 配置）
       * - `MJ_UPSTREAM_AUTH=both` 或 `MJ_UPSTREAM_MIRROR_SECRET=1`：Bearer + mj-api-secret
       */
      const authMode = process.env.MJ_UPSTREAM_AUTH?.trim().toLowerCase();
      if (authMode === 'secret') {
        headers['mj-api-secret'] = row.key;
      } else {
        headers.Authorization = `Bearer ${row.key}`;
        if (authMode === 'both' || process.env.MJ_UPSTREAM_MIRROR_SECRET === '1') {
          headers['mj-api-secret'] = row.key;
        }
      }
    }
    if (options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    const cfg: AxiosRequestConfig = {
      method: options.method || 'POST',
      url,
      headers,
      timeout: (row.timeout || 300) * 1000,
      validateStatus: () => true,
      maxBodyLength: 50 * 1024 * 1024,
      maxContentLength: 50 * 1024 * 1024,
    };
    if (options.method === 'GET') {
      cfg.params = options.params;
    } else {
      cfg.data = options.data ?? {};
    }
    const m = options.method || 'POST';
    if (m !== 'GET' && cfg.data && typeof cfg.data === 'object' && !Array.isArray(cfg.data)) {
      /** 须用 log：CustomLoggerService 在生产环境丢弃 warn，导致排障时看不到上游摘要 */
      Logger.log(
        `[MJ] → ${pathAfterPrefix} ${mjSafeUrlForLog(url)} ${JSON.stringify(
          mjSummarizePostBody(cfg.data as Record<string, unknown>),
        )}`,
        'DrawingMjService',
      );
    }
    try {
      const res = await axios.request(cfg);
      const sum = mjSummarizeResponseBody(res.data);
      const line = `[MJ] ← ${pathAfterPrefix} HTTP ${res.status} ${mjSafeUrlForLog(
        url,
      )} ${JSON.stringify(sum)}`;
      if (res.status >= 400) {
        Logger.error(line, 'DrawingMjService');
      } else {
        Logger.log(line, 'DrawingMjService');
      }
      return { status: res.status, data: res.data };
    } catch (e: any) {
      Logger.error(`MJ upstream error: ${e?.message}`, 'DrawingMjService');
      throw new HttpException(e?.message || '上游请求失败', HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * 调用上游 `upload-discord-images`，返回可公网访问的 **https** 图链（不做 Blend 用的二次拉取转 Data URL）。
   * 供 `--cref` / `--sref` / `--oref` 等需在提示词中写 URL 的场景使用。
   */
  async uploadDiscordImagesToCdnHttpsUrls(
    row: ModelsEntity,
    mode: MjSpeedMode,
    base64Array: string[],
  ): Promise<string[]> {
    if (!Array.isArray(base64Array) || base64Array.length === 0) {
      throw new BadRequestException('upload-discord-images：base64Array 为空');
    }
    const res = await this.requestUpstream(row, mode, '/submit/upload-discord-images', {
      data: { base64Array },
    });
    if (res.status >= 400) {
      throw new HttpException(
        `upload-discord-images 上游 HTTP ${res.status}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    const env = unwrapMjSubmitEnvelope(res.data);
    const code = Number(env.code);
    if (code !== 1 && code !== 22) {
      throw new BadRequestException(
        `upload-discord-images 未成功: ${JSON.stringify({
          code: env.code,
          description: env.description,
        })}`,
      );
    }
    const raw = env.result;
    if (!Array.isArray(raw)) {
      throw new BadRequestException('upload-discord-images 返回 result 非数组');
    }
    const urls = raw.map(x => String(x ?? '').trim()).filter(Boolean);
    if (urls.length < base64Array.length) {
      throw new BadRequestException(
        `upload-discord-images 返回条数不足：需 ${base64Array.length}，实际 ${urls.length}`,
      );
    }
    const slice = urls.slice(0, base64Array.length);
    for (const u of slice) {
      if (!/^https:\/\//i.test(u)) {
        throw new BadRequestException(
          `upload-discord-images 返回非 https 图链，无法用于 cref/sref/oref：${u.slice(0, 120)}`,
        );
      }
    }
    return slice;
  }

  /**
   * 部分网关：Blend 直连客户端 Data URL 会在执行期报 invalid_parameter；
   * 先 `upload-discord-images`，再拉取 CDN 图；个别执行层常将带 `data:` 前缀的串误判为提示词 → 默认送**裸 base64**（`MJ_BLEND_AFTER_UPLOAD_DATAURL=1` 则仍送 Data URL）。
   * 若直接把 HTTPS 填进 base64Array 会报 invalid_image_prompt_link。
   * `MJ_BLEND_AFTER_UPLOAD_KEEP_URLS=1`：跳过拉取，仅传 URL（仅当上游支持 URL 混图时）。
   */
  async uploadDiscordImagesForBlend(
    row: ModelsEntity,
    mode: MjSpeedMode,
    base64Array: string[],
  ): Promise<string[]> {
    const slice = await this.uploadDiscordImagesToCdnHttpsUrls(row, mode, base64Array);
    if (process.env.MJ_BLEND_AFTER_UPLOAD_KEEP_URLS === '1') {
      return slice;
    }
    const timeoutMs = Math.max(15_000, Math.min(300_000, (row.timeout || 300) * 1000));
    const dataUrls: string[] = [];
    for (const u of slice) {
      dataUrls.push(await this.mjFetchBlendImageUrlAsDataUrl(u, timeoutMs));
    }
    const hostMatchesMarkers = proxyUrlMatchesMjHostMarkers(row.proxyUrl);
    if (
      hostMatchesMarkers &&
      process.env.MJ_BLEND_AFTER_UPLOAD_DATAURL !== '1' &&
      process.env.MJ_BLEND_AFTER_UPLOAD_KEEP_URLS !== '1'
    ) {
      return dataUrls.map(s => {
        const m = s.match(/^data:image\/[^;]+;base64,(.+)$/i);
        return m ? m[1]! : s;
      });
    }
    return dataUrls;
  }

  private async mjFetchBlendImageUrlAsDataUrl(
    imageUrl: string,
    timeoutMs: number,
  ): Promise<string> {
    const u = String(imageUrl || '').trim();
    if (!/^https?:\/\//i.test(u)) {
      throw new BadRequestException(`上传返回的图片地址无效: ${u.slice(0, 96)}`);
    }
    try {
      const getRes = await axios.get<ArrayBuffer>(u, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: 25 * 1024 * 1024,
        maxBodyLength: 25 * 1024 * 1024,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HOAI-MJ-Blend/1.0)',
          Accept: 'image/*,*/*;q=0.8',
        },
      });
      if (getRes.status >= 400) {
        throw new BadRequestException(
          `拉取上传图失败 HTTP ${getRes.status}: ${mjSafeUrlForLog(u)}`,
        );
      }
      const buf = Buffer.from(getRes.data);
      if (!buf.length) {
        throw new BadRequestException(`拉取上传图为空: ${mjSafeUrlForLog(u)}`);
      }
      const ct = String(getRes.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const prefix =
        ct.startsWith('image/') && ct.length < 40
          ? `data:${ct};base64,`
          : mjDataUrlPrefixFromImageBuffer(buf);
      return `${prefix}${buf.toString('base64')}`;
    } catch (e: unknown) {
      if (e instanceof BadRequestException) throw e;
      const msg =
        e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
      throw new BadRequestException(`拉取上传图失败: ${msg} (${mjSafeUrlForLog(u)})`);
    }
  }

  /** 预设 Zoom Out 是否改走 Custom Zoom + submit/modal；见 `MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM`、`MJ_PROXY_HOST_MARKERS` 与 `presetOutpaintCustomZoomEnabledForProxy` */
  presetOutpaintCustomZoomEnabled(row: ModelsEntity): boolean {
    return presetOutpaintCustomZoomEnabledForProxy(row.proxyUrl || '');
  }

  /**
   * 部分代理：预设 Outpaint 直连会在执行期 invalid_parameter → 先走 Custom Zoom（窗口等待）再 submit/modal。
   * 上游 Body 与 OpenAPI 一致：action 仅 tid+customId；modal 仅 taskId+prompt。
   */
  async submitPresetOutpaintViaCustomZoom(
    row: ModelsEntity,
    mode: MjSpeedMode,
    parentTaskId: string,
    outpaintCustomId: string,
  ): Promise<{ status: number; data: unknown }> {
    const tid = String(parentTaskId || '').trim();
    const cid = String(outpaintCustomId || '').trim();
    const zoomNum = outpaintTargetZoomNumber(cid);
    const direct = (): Promise<{ status: number; data: unknown }> =>
      this.requestUpstream(row, mode, '/submit/action', {
        data: { taskId: tid, customId: cid },
      });

    if (!tid || !zoomNum || !isPresetOutpaintCustomId(cid)) {
      return direct();
    }

    let fetchRes: { status: number; data: unknown };
    try {
      fetchRes = await this.requestUpstream(row, mode, `/task/${encodeURIComponent(tid)}/fetch`, {
        method: 'GET',
      });
    } catch {
      return direct();
    }

    if (fetchRes.status >= 400 || fetchRes.data == null) {
      Logger.warn('[MJ] Outpaint→CZ: parent fetch failed, direct Outpaint', 'DrawingMjService');
      return direct();
    }

    const task = unwrapMjTaskFromFetchData(fetchRes.data);
    const czCid = mjTaskButtonCustomZoomCustomId(task);
    if (!czCid) {
      Logger.warn('[MJ] Outpaint→CZ: no Custom Zoom button, direct Outpaint', 'DrawingMjService');
      return direct();
    }

    Logger.log('[MJ] Outpaint→CZ: preset button → Custom Zoom chain', 'DrawingMjService');

    const step1 = await this.requestUpstream(row, mode, '/submit/action', {
      data: { taskId: tid, customId: czCid },
    });
    if (step1.status >= 400) return step1;

    const envl = unwrapMjSubmitEnvelope(step1.data);
    const code = Number(envl.code);
    const modalTaskId = envl.result != null ? String(envl.result).trim() : '';

    if (code !== 21 || !modalTaskId) {
      Logger.log(
        `[MJ] Outpaint→CZ: open modal code=${code} (expected 21), return upstream response`,
        'DrawingMjService',
      );
      return step1;
    }

    const delayRaw = parseInt(String(process.env.MJ_OUTPAINT_CZ_MODAL_DELAY_MS || '').trim(), 10);
    const delayMs = Number.isFinite(delayRaw) ? Math.min(10_000, Math.max(0, delayRaw)) : 400;
    if (delayMs > 0) {
      await new Promise<void>(r => setTimeout(r, delayMs));
    }

    const modalPrompt = buildCustomZoomModalPromptFromTask(task, zoomNum);
    Logger.log(
      `[MJ] Outpaint→CZ: POST /submit/modal promptLen=${modalPrompt.length}`,
      'DrawingMjService',
    );

    return this.requestUpstream(row, mode, '/submit/modal', {
      data: { taskId: modalTaskId, prompt: modalPrompt },
    });
  }

  guessChargeMultiplier(prompt: string): number {
    if (!prompt || !String(prompt).trim()) return 1;
    if (prompt.includes('--v 8')) return 8;
    if (prompt.includes('--v 7')) return 8;
    if (prompt.includes('--niji 7')) return 8;
    if (prompt.includes('--draft')) return 2;
    return 4;
  }

  /**
   * Midjourney 单次请求的「基准扣费」（再乘以 guessChargeMultiplier 等倍数）。
   * drawingType≠3 时退回通用 deduct；MJ 各速度未单独配置时退回 deduct。
   */
  mjBaseDeductPerUnit(row: ModelsEntity, mode: MjSpeedMode): number {
    const fallbackRaw = Number(row.deduct);
    const fallback = Number.isFinite(fallbackRaw) && fallbackRaw >= 0 ? fallbackRaw : 0;
    if (Number(row.drawingType) !== 3) {
      return fallback;
    }
    const pick = (v: number | null | undefined): number | null => {
      if (v === null || v === undefined) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    };
    let chosen: number | null = null;
    if (mode === 'relax') chosen = pick(row.deductMjRelax ?? null);
    else if (mode === 'turbo') chosen = pick(row.deductMjTurbo ?? null);
    else chosen = pick(row.deductMjFast ?? null);
    return chosen ?? fallback;
  }

  /**
   * 服务端拉取远程图片（用于前端「另存为」绕开浏览器跨域）。
   * 含基础 SSRF 防护：仅 http(s)，禁止常见内网/环回主机。
   */
  assertSafeImageProxyUrl(raw: string): URL {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BadRequestException('无效的 URL');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new BadRequestException('仅允许 http/https');
    }
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    ) {
      throw new BadRequestException('禁止访问该地址');
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const ha = Number(ipv4[1]);
      const hb = Number(ipv4[2]);
      if (
        ha === 10 ||
        ha === 127 ||
        ha === 0 ||
        (ha === 169 && hb === 254) ||
        (ha === 172 && hb >= 16 && hb <= 31) ||
        (ha === 192 && hb === 168)
      ) {
        throw new BadRequestException('禁止访问该地址');
      }
    }
    if (host === '[::1]' || host === '::1') {
      throw new BadRequestException('禁止访问该地址');
    }
    return u;
  }

  private bufferLooksLikeImage(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
      return true;
    return false;
  }

  private safeDownloadFilename(urlStr: string): string {
    try {
      const seg = new URL(urlStr).pathname.split('/').filter(Boolean).pop() || 'image.png';
      const cleaned = seg
        .replace(/[^\w.\-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 120);
      return cleaned.match(/\.(png|jpe?g|webp|gif)$/i) ? cleaned : `${cleaned || 'image'}.png`;
    } catch {
      return 'image.png';
    }
  }

  private normalizeImageContentType(ctRaw: string, buf: Buffer): string {
    const base = String(ctRaw || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (base.startsWith('image/')) return base;
    if (
      (base === 'application/octet-stream' || base === 'binary/octet-stream') &&
      this.bufferLooksLikeImage(buf)
    ) {
      if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
      if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
      if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
      return 'image/webp';
    }
    throw new BadRequestException('响应不是可识别的图片');
  }

  async proxyFetchImage(
    rawUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed || trimmed.length > 4096) {
      throw new BadRequestException('URL 过长或为空');
    }
    const u = this.assertSafeImageProxyUrl(trimmed);
    const urlStr = u.toString();

    try {
      const res = await axios.get<ArrayBuffer>(urlStr, {
        responseType: 'arraybuffer',
        timeout: 45000,
        maxContentLength: 30 * 1024 * 1024,
        maxBodyLength: 30 * 1024 * 1024,
        validateStatus: status => status === 200,
        headers: { Accept: 'image/*,*/*;q=0.8' },
      });

      if (res.status !== 200 || !res.data) {
        throw new BadRequestException('图片下载失败');
      }

      const buf = Buffer.from(res.data);
      if (buf.length === 0 || buf.length > 30 * 1024 * 1024) {
        throw new BadRequestException('图片过大或为空');
      }

      const ctHeader = String(res.headers['content-type'] || '')
        .split(';')[0]
        .trim();
      const contentType = this.normalizeImageContentType(ctHeader, buf);
      const filename = this.safeDownloadFilename(urlStr);

      return { buffer: buf, contentType, filename };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      Logger.warn(`proxyFetchImage failed: ${e?.message}`, 'DrawingMjService');
      throw new BadRequestException(e?.message || '图片拉取失败');
    }
  }
}
