import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import { Repository } from 'typeorm';
import { ModelsEntity } from '../models/models.entity';

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
    if (typeof v === 'string') {
      const lk = k.toLowerCase();
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
