import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import { ModelsEntity } from '../models/models.entity';
import { UploadService } from '../upload/upload.service';
import { SunoMusicService } from './suno-music.service';
import { resolveSunoApiFlavor } from './suno-proxy.util';

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function extFromFilename(name: string): string {
  const m = String(name || '').match(/\.([a-z0-9]+)$/i);
  const ext = m?.[1]?.toLowerCase() || 'mp3';
  if (['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'].includes(ext)) return ext;
  return 'mp3';
}

function unwrapBody(data: unknown): Record<string, unknown> {
  const unwrapped = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const code = String(unwrapped.code ?? '').toLowerCase();
  if ((code === 'success' || code === 'ok') && unwrapped.data != null) {
    const inner = unwrapped.data;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return unwrapped;
}

@Injectable()
export class SunoUploadService {
  private readonly logger = new Logger(SunoUploadService.name);

  constructor(
    private readonly sunoMusicService: SunoMusicService,
    private readonly uploadService: UploadService,
  ) {}

  private async uploadViaMultipart(
    row: ModelsEntity,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
  ): Promise<unknown> {
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname || 'audio.mp3',
      contentType: file.mimetype || 'audio/mpeg',
    });
    const out = await this.sunoMusicService.requestUpstream(row, '/suno/upload', { form });
    if (out.status < 200 || out.status >= 300) {
      throw new HttpException(
        this.sunoMusicService.extractErrorMessage(out.data) || 'multipart 上传失败',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const body = this.sunoMusicService.unwrapUpstreamBody(out.data);
    return body && typeof body === 'object' ? body : out.data;
  }

  /** submit 风格上游：先托管到公网 URL，再调 /suno/uploads/audio-url */
  private async uploadViaPublicUrl(
    row: ModelsEntity,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    user?: { id?: number } | null,
  ): Promise<unknown> {
    const hostedUrl = await this.uploadService.uploadFile(
      { buffer: file.buffer, mimetype: file.mimetype || 'audio/mpeg' },
      'music/upload',
      user,
    );
    const url = String(hostedUrl || '').trim();
    if (!url) {
      throw new HttpException('音频托管失败，未获得公网地址', HttpStatus.BAD_GATEWAY);
    }
    this.logger.log(`[Suno] upload url-bridge → ${url.slice(0, 96)}`);
    const out = await this.sunoMusicService.requestUpstream(row, '/suno/uploads/audio-url', {
      data: { url },
    });
    if (out.status < 200 || out.status >= 300) {
      throw new HttpException(
        this.sunoMusicService.extractErrorMessage(out.data) || 'URL 上传失败',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const body = this.sunoMusicService.unwrapUpstreamBody(out.data);
    return body ?? out.data;
  }

  /**
   * 智能上传：submit 上游走 URL 桥接；generate 先 multipart，失败再 S3 管道，最后 URL 桥接
   */
  async uploadAudioSmart(
    row: ModelsEntity,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    user?: { id?: number } | null,
  ): Promise<unknown> {
    const flavor = resolveSunoApiFlavor(row.proxyUrl || '');
    if (flavor === 'submit') {
      return this.uploadViaPublicUrl(row, file, user);
    }
    try {
      return await this.uploadViaMultipart(row, file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[Suno] multipart upload failed: ${msg}`);
    }
    try {
      return await this.uploadViaPipeline(row, file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[Suno] pipeline upload failed: ${msg}`);
    }
    return this.uploadViaPublicUrl(row, file, user);
  }

  private async requestInit(row: ModelsEntity, extension: string) {
    const paths = ['/sunoi/uploads/audio', '/suno/uploads/audio'];
    let last: { status: number; data: unknown } | null = null;
    for (const path of paths) {
      const out = await this.sunoMusicService.requestUpstream(row, path, {
        data: { extension },
      });
      last = out;
      if (out.status >= 200 && out.status < 300) return out;
    }
    if (last) return last;
    throw new HttpException('上传初始化失败', HttpStatus.BAD_GATEWAY);
  }

  private async putToS3(
    uploadUrl: string,
    fields: Record<string, string>,
    buffer: Buffer,
    filename: string,
    contentType: string,
  ) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }
    form.append('file', buffer, { filename, contentType });
    const res = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: 80 * 1024 * 1024,
      validateStatus: () => true,
      timeout: 120_000,
    });
    if (res.status >= 400) {
      this.logger.warn(`S3 upload HTTP ${res.status}`);
      throw new HttpException(`S3 上传失败 HTTP ${res.status}`, HttpStatus.BAD_GATEWAY);
    }
  }

  private async pollUploadStatus(row: ModelsEntity, uploadId: string, max = 30) {
    const paths = [
      `/sunoi/uploads/audio/${encodeURIComponent(uploadId)}`,
      `/suno/uploads/audio/${encodeURIComponent(uploadId)}`,
    ];
    for (let i = 0; i < max; i++) {
      for (const path of paths) {
        const out = await this.sunoMusicService.requestUpstream(row, path, { method: 'GET' });
        if (out.status < 200 || out.status >= 300) continue;
        const body = unwrapBody(out.data);
        const status = String(body.status ?? '').toLowerCase();
        if (status === 'complete' || status === 'success') return body;
        if (status === 'error' || status === 'failed') {
          const err = String(body.error_message ?? body.message ?? '上传处理失败');
          throw new HttpException(err, HttpStatus.BAD_GATEWAY);
        }
      }
      await sleep(2000);
    }
    throw new HttpException('上传处理超时', HttpStatus.GATEWAY_TIMEOUT);
  }

  private async finishUpload(row: ModelsEntity, uploadId: string, filename: string) {
    const paths = [
      `/sunoi/uploads/audio/${encodeURIComponent(uploadId)}/upload-finish`,
      `/suno/uploads/audio/${encodeURIComponent(uploadId)}/upload-finish`,
    ];
    const payload = { upload_type: 'file_upload', upload_filename: filename };
    for (const path of paths) {
      const out = await this.sunoMusicService.requestUpstream(row, path, { data: payload });
      if (out.status >= 200 && out.status < 300) return;
    }
    throw new HttpException('报告上传完毕失败', HttpStatus.BAD_GATEWAY);
  }

  private async initializeClip(row: ModelsEntity, uploadId: string): Promise<string> {
    const paths = [
      `/sunoi/uploads/audio/${encodeURIComponent(uploadId)}/initialize-clip`,
      `/suno/uploads/audio/${encodeURIComponent(uploadId)}/initialize-clip`,
    ];
    for (const path of paths) {
      const out = await this.sunoMusicService.requestUpstream(row, path, { data: {} });
      if (out.status < 200 || out.status >= 300) continue;
      const body = unwrapBody(out.data);
      const clipId = String(body.clip_id ?? body.clipId ?? '').trim();
      if (clipId) return clipId;
    }
    throw new HttpException('初始化 clip 失败', HttpStatus.BAD_GATEWAY);
  }

  /** S3 多步上传：init → PUT S3 → finish → poll → initialize-clip（仅 generate 风格网关） */
  async uploadViaPipeline(
    row: ModelsEntity,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    user?: { id?: number } | null,
  ): Promise<{ clip_id: string; upload_id?: string }> {
    const flavor = resolveSunoApiFlavor(row.proxyUrl || '');
    if (flavor === 'submit') {
      const body = await this.uploadViaPublicUrl(row, file, user);
      const clipId = this.extractClipIdFromUploadBody(body);
      if (!clipId) {
        throw new HttpException('URL 上传未返回 clip_id', HttpStatus.BAD_GATEWAY);
      }
      return { clip_id: clipId };
    }
    const filename = file.originalname || 'audio.mp3';
    const extension = extFromFilename(filename);
    const initOut = await this.requestInit(row, extension);
    if (initOut.status < 200 || initOut.status >= 300) {
      throw new HttpException(
        this.sunoMusicService.extractErrorMessage(initOut.data) || '上传初始化失败',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const initBody = unwrapBody(initOut.data);
    const uploadId = String(initBody.id ?? '').trim();
    const uploadUrl = String(initBody.url ?? '').trim();
    const fieldsRaw = initBody.fields;
    if (!uploadId || !uploadUrl || !fieldsRaw || typeof fieldsRaw !== 'object') {
      throw new HttpException('上传初始化响应不完整', HttpStatus.BAD_GATEWAY);
    }
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fieldsRaw as Record<string, unknown>)) {
      fields[k] = String(v ?? '');
    }
    const contentType =
      fields['Content-Type'] ||
      file.mimetype ||
      `audio/${extension === 'mp3' ? 'mpeg' : extension}`;

    await this.putToS3(uploadUrl, fields, file.buffer, filename, contentType);
    await this.finishUpload(row, uploadId, filename);
    await this.pollUploadStatus(row, uploadId);
    const clipId = await this.initializeClip(row, uploadId);
    return { clip_id: clipId, upload_id: uploadId };
  }

  private extractClipIdFromUploadBody(body: unknown): string {
    if (typeof body === 'string') return body.trim();
    if (!body || typeof body !== 'object') return '';
    const o = body as Record<string, unknown>;
    return String(o.clip_id ?? o.clipId ?? o.task_id ?? o.id ?? '').trim();
  }
}
