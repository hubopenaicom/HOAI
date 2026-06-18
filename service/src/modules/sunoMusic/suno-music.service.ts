import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosRequestConfig } from 'axios';
import * as FormData from 'form-data';
import { Repository } from 'typeorm';
import { ModelsEntity } from '../models/models.entity';
import { SUNO_DRAWING_TYPE } from './suno-music.constants';
import {
  buildSunoUpstreamPath,
  resolveSunoApiFlavor,
  sunoSafeUrlForLog,
  type SunoApiFlavor,
} from './suno-proxy.util';
import {
  extractLyricsFromSunoFetchTask,
  extractLyricsTaskIdFromSubmit,
  extractSunoClipsFromBody,
  extractSunoErrorMessage,
  extractSunoPersonaId,
  extractSunoTagsExpanded,
  isLikelySunoClipId,
  isLikelySunoHtmlBody,
  SUNO_UPSTREAM_HTML_HINT,
  unwrapSunoEnvelope,
} from './suno-response.util';
import { lyricsFetchUpstreamPath, lyricsSubmitUpstreamPath } from './suno-proxy.util';
import { adaptStemPayloadForSubmitFlavor } from './suno-stem-adapt.util';

function coerceUpstreamData(data: unknown): unknown {
  if (data == null) return data;
  if (typeof data === 'string') {
    if (isLikelySunoHtmlBody(data)) {
      throw new HttpException(SUNO_UPSTREAM_HTML_HINT, HttpStatus.BAD_GATEWAY);
    }
    const trimmed = data.trim();
    if (!trimmed) return data;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        throw new HttpException('上游返回非 JSON 内容', HttpStatus.BAD_GATEWAY);
      }
    }
    return data;
  }
  return data;
}

@Injectable()
export class SunoMusicService {
  private readonly logger = new Logger(SunoMusicService.name);

  constructor(
    @InjectRepository(ModelsEntity)
    private readonly modelsEntity: Repository<ModelsEntity>,
  ) {}

  async resolveSunoModel(modelKey: string): Promise<ModelsEntity> {
    if (!modelKey?.trim()) {
      throw new HttpException('缺少模型参数 model', HttpStatus.BAD_REQUEST);
    }
    const row = await this.modelsEntity.findOne({ where: { model: modelKey.trim() } });
    if (!row || !row.status) {
      throw new HttpException('模型不存在或未启用', HttpStatus.BAD_REQUEST);
    }
    const dt = Number(row.drawingType);
    const legacy =
      String(row.model).toLowerCase().includes('suno') ||
      String(row.modelName || '')
        .toLowerCase()
        .includes('suno');
    if (dt !== SUNO_DRAWING_TYPE && !legacy) {
      throw new HttpException(
        `当前模型不是 Suno 音乐类型（drawingType=${SUNO_DRAWING_TYPE}）`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!row.proxyUrl?.trim()) {
      throw new HttpException('模型未配置上游地址 proxyUrl', HttpStatus.BAD_REQUEST);
    }
    if (!row.key?.trim()) {
      throw new HttpException('模型未配置上游 API Key', HttpStatus.BAD_REQUEST);
    }
    return row;
  }

  getApiFlavor(row: ModelsEntity): SunoApiFlavor {
    return resolveSunoApiFlavor(row.proxyUrl || '');
  }

  /** submit 上游（ephone 等）将 vocal-stems/all-stems 转为 gen_stem */
  adaptGeneratePayloadForUpstream(
    row: ModelsEntity,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return adaptStemPayloadForSubmitFlavor(this.getApiFlavor(row), payload);
  }

  buildAuthHeaders(row: ModelsEntity): Record<string, string> {
    return {
      Authorization: `Bearer ${row.key}`,
      Accept: 'application/json',
    };
  }

  async requestUpstream(
    row: ModelsEntity,
    path: string,
    options: {
      method?: 'GET' | 'POST';
      data?: unknown;
      params?: Record<string, unknown>;
      /** multipart 上传 */
      form?: FormData;
    },
  ): Promise<{ status: number; data: unknown }> {
    const { url, routeStyle, flavor } = buildSunoUpstreamPath(row.proxyUrl, path);
    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(row),
    };
    if (options.form) {
      Object.assign(headers, options.form.getHeaders());
    } else if (options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    const cfg: AxiosRequestConfig = {
      method: options.method || 'POST',
      url,
      headers,
      timeout: (row.timeout || 300) * 1000,
      validateStatus: () => true,
      maxBodyLength: 80 * 1024 * 1024,
      maxContentLength: 80 * 1024 * 1024,
      responseType: 'text',
      transformResponse: [d => d],
    };
    if (options.method === 'GET') {
      cfg.params = options.params;
    } else if (options.form) {
      cfg.data = options.form;
    } else {
      cfg.data = options.data ?? {};
    }
    try {
      const res = await axios.request(cfg);
      let data: unknown = res.data;
      try {
        data = coerceUpstreamData(data);
      } catch (e) {
        if (e instanceof HttpException) throw e;
        throw new HttpException('上游响应解析失败', HttpStatus.BAD_GATEWAY);
      }
      const line = `[Suno] ← ${path} HTTP ${res.status} ${sunoSafeUrlForLog(
        url,
      )} (${routeStyle}/${flavor})`;
      if (res.status >= 400) this.logger.error(line);
      else this.logger.log(line);
      if (res.status >= 200 && res.status < 300 && isLikelySunoHtmlBody(data)) {
        throw new HttpException(SUNO_UPSTREAM_HTML_HINT, HttpStatus.BAD_GATEWAY);
      }
      return { status: res.status, data };
    } catch (e: unknown) {
      if (e instanceof HttpException) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Suno upstream error: ${msg}`);
      throw new HttpException(msg || '上游请求失败', HttpStatus.BAD_GATEWAY);
    }
  }

  unwrapUpstreamBody(data: unknown): unknown {
    return unwrapSunoEnvelope(data);
  }

  extractErrorMessage(data: unknown): string {
    return extractSunoErrorMessage(data);
  }

  /** generate 成功：HTTP 2xx 且返回 clips 或 clip 列表（兼容 { code, data } 包装） */
  isGenerateSuccess(status: number, data: unknown): boolean {
    if (status < 200 || status >= 300) return false;
    if (isLikelySunoHtmlBody(data)) return false;
    const err = extractSunoErrorMessage(data);
    if (err) return false;
    if (extractSunoClipsFromBody(data).length > 0) return true;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      const code = String(o.code ?? '').toLowerCase();
      const inner = unwrapSunoEnvelope(data);
      if (code === 'success' && typeof inner === 'string' && isLikelySunoClipId(inner)) {
        return true;
      }
    }
    return false;
  }

  /** 返回给前端的统一结构（尽量含 clips 数组） */
  normalizeGenerateResponse(data: unknown): Record<string, unknown> {
    const clips = extractSunoClipsFromBody(data);
    if (clips.length) return { clips };
    const unwrapped = unwrapSunoEnvelope(data);
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      return unwrapped as Record<string, unknown>;
    }
    if (typeof unwrapped === 'string' && isLikelySunoClipId(unwrapped)) {
      return { clips: [{ id: unwrapped.trim(), status: 'submitted' }] };
    }
    return (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  }

  sunoBaseDeduct(row: ModelsEntity): number {
    const d = Number(row.deduct);
    return Number.isFinite(d) && d > 0 ? d : 1;
  }

  /** 歌曲拼接路径（ephone 场景文档用 generate/concat；OpenAPI 另有 submit/concat） */
  concatUpstreamPaths(row: ModelsEntity): string[] {
    const env = process.env.SUNO_CONCAT_PATH?.trim();
    if (env) return [env];
    const flavor = resolveSunoApiFlavor(row.proxyUrl || '');
    if (flavor === 'submit') {
      return ['/suno/generate/concat', '/suno/submit/concat'];
    }
    return ['/suno/generate/concat'];
  }

  concatUpstreamPath(row?: ModelsEntity): string {
    if (row) return this.concatUpstreamPaths(row)[0];
    const p = process.env.SUNO_CONCAT_PATH?.trim();
    return p || '/suno/generate/concat';
  }

  /** 拼接：按路径顺序尝试，兼容 Job not exits 等端点差异 */
  async requestConcat(
    row: ModelsEntity,
    clipId: string,
    isInfill: boolean,
  ): Promise<{ status: number; data: unknown }> {
    const paths = this.concatUpstreamPaths(row);
    let last: { status: number; data: unknown } | null = null;
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const out = await this.requestUpstream(row, path, {
        data: { clip_id: clipId, is_infill: isInfill === true },
      });
      if (this.isConcatSuccess(out.status, out.data)) return out;
      last = out;
      const err = extractSunoErrorMessage(out.data);
      const retryable = /job\s+not\s+exi/i.test(err);
      if (!retryable || i >= paths.length - 1) break;
      this.logger.warn(`[Suno] concat ${path} failed (${err}), trying fallback`);
    }
    return last!;
  }

  isHttpOk(status: number): boolean {
    return status >= 200 && status < 300;
  }

  /** concat 成功：code=success 或返回 data/task_id / clips */
  isConcatSuccess(status: number, data: unknown): boolean {
    if (!this.isHttpOk(status) || data == null) return false;
    if (isLikelySunoHtmlBody(data)) return false;
    if (extractSunoErrorMessage(data)) return false;
    if (extractSunoClipsFromBody(data).length > 0) return true;
    if (typeof data === 'string' && isLikelySunoClipId(data)) return true;
    const unwrapped = unwrapSunoEnvelope(data);
    if (typeof unwrapped === 'string' && isLikelySunoClipId(unwrapped)) return true;
    if (typeof data !== 'object') return false;
    const o = data as Record<string, unknown>;
    const code = String(o.code ?? '').toLowerCase();
    if (code === 'success') return true;
    if (o.task_id != null && String(o.task_id).trim()) return true;
    return false;
  }

  /** Persona 创建成功：返回 id */
  isPersonaCreateSuccess(status: number, data: unknown): boolean {
    if (!this.isHttpOk(status)) return false;
    if (isLikelySunoHtmlBody(data)) return false;
    if (extractSunoErrorMessage(data)) return false;
    return Boolean(extractSunoPersonaId(data));
  }

  normalizePersonaCreateResponse(data: unknown): Record<string, unknown> {
    const id = extractSunoPersonaId(data);
    return id ? { id } : (unwrapSunoEnvelope(data) as Record<string, unknown>) || {};
  }

  normalizeTagsResponse(data: unknown): Record<string, unknown> {
    const tags = extractSunoTagsExpanded(data);
    if (tags) return { upsampled_tags: tags };
    const unwrapped = unwrapSunoEnvelope(data);
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      return unwrapped as Record<string, unknown>;
    }
    return (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  }

  lyricsSubmitPath(row: ModelsEntity): string {
    return lyricsSubmitUpstreamPath(this.getApiFlavor(row));
  }

  lyricsFetchPath(row: ModelsEntity, taskId: string): string {
    return lyricsFetchUpstreamPath(this.getApiFlavor(row), taskId);
  }

  isLyricsSubmitSuccess(status: number, data: unknown): boolean {
    if (!this.isHttpOk(status) || data == null) return false;
    if (isLikelySunoHtmlBody(data)) return false;
    if (extractSunoErrorMessage(data)) return false;
    return Boolean(extractLyricsTaskIdFromSubmit(data));
  }

  normalizeLyricsSubmitResponse(data: unknown): Record<string, unknown> {
    const taskId = extractLyricsTaskIdFromSubmit(data);
    return taskId ? { task_id: taskId } : {};
  }

  normalizeLyricsPollResponse(data: unknown): Record<string, unknown> {
    const r = extractLyricsFromSunoFetchTask(data);
    return {
      task_id: r.taskId,
      text: r.text,
      title: r.title,
      status: r.status,
      fail_reason: r.failReason,
    };
  }

  /** WAV / MP4 / Timing 等 GET 辅助接口 */
  isActResourceReady(status: number, data: unknown): boolean {
    if (!this.isHttpOk(status) || !data || typeof data !== 'object') return false;
    const o = data as Record<string, unknown>;
    if (o.wav_file_url && String(o.wav_file_url).trim()) return true;
    if (o.mp4 && String(o.mp4).trim()) return true;
    if (Array.isArray(o.aligned_words) && o.aligned_words.length > 0) return true;
    if (o.state === 'complete') return true;
    return false;
  }
}
