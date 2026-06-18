import { JwtAuthGuard } from '@/common/auth/jwtAuth.guard';
import { UserBalanceService } from '@/modules/userBalance/userBalance.service';
import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { SUNO_ALL_STEMS_CHARGE_MULT, SUNO_LYRICS_CHARGE_MULT } from './suno-music.constants';
import { CreateSunoMusicJobDto, SunoMusicJobService } from './suno-music-job.service';
import { SunoMusicJobEntity } from './suno-music-job.entity';
import { extractClipsFromSunoFetchTask } from './suno-response.util';
import { humanizeSunoUpstreamError, isBenignSunoFeedMiss } from './suno-upstream-error.util';
import { SunoMusicService } from './suno-music.service';
import { SunoUploadService } from './suno-upload.service';

@ApiTags('suno-music')
@Controller('music/suno')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SunoMusicController {
  constructor(
    private readonly sunoMusicService: SunoMusicService,
    private readonly sunoMusicJobService: SunoMusicJobService,
    private readonly sunoUploadService: SunoUploadService,
    private readonly userBalanceService: UserBalanceService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private async getMusicJobsSyncSeq(userId: number): Promise<number> {
    const u = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'musicJobsSyncSeq'],
    });
    return Number(u?.musicJobsSyncSeq ?? 0);
  }

  private async bumpMusicJobsSyncSeq(userId: number): Promise<number> {
    await this.userRepo.increment({ id: userId }, 'musicJobsSyncSeq', 1);
    return this.getMusicJobsSyncSeq(userId);
  }

  private jobEntityToDto(e: SunoMusicJobEntity) {
    let clip: Record<string, unknown> | undefined;
    try {
      if (e.clipJson) clip = JSON.parse(e.clipJson) as Record<string, unknown>;
    } catch {
      clip = undefined;
    }
    const ckRaw = e.clientKey?.trim() || '';
    const ckNum = ckRaw ? Number(ckRaw) : undefined;
    return {
      id: e.id,
      clientKey:
        ckRaw && Number.isFinite(ckNum as number) && String(ckNum) === ckRaw ? ckNum : e.clientKey,
      clipId: e.clipId ?? '',
      modelKey: e.modelKey,
      sceneLabel: e.sceneLabel ?? undefined,
      promptLabel: e.promptLabel,
      status: e.status,
      loading: !!e.loading,
      error: e.error ?? undefined,
      clip,
      deductCharged: e.deductCharged != null ? Number(e.deductCharged) : undefined,
      chargeMult: e.chargeMult != null ? Number(e.chargeMult) : undefined,
      deductTypeSnapshot: e.deductTypeSnapshot != null ? Number(e.deductTypeSnapshot) : undefined,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  private throwUpstreamFailure(status: number, data: unknown) {
    const raw =
      this.sunoMusicService.extractErrorMessage(data) ||
      (status >= 400 ? `上游 HTTP ${status}` : 'Suno 上游返回失败');
    const msg = humanizeSunoUpstreamError(raw, status);
    const httpStatus = status >= 400 && status < 600 ? status : HttpStatus.BAD_GATEWAY;
    throw new HttpException(msg, httpStatus);
  }

  private async withCharge(
    req: Request,
    row: { deduct: number; deductType: number },
    chargeMult: number,
    scene: string,
    isSuccess: (status: number, data: unknown) => boolean,
    fn: () => Promise<{ status: number; data: unknown }>,
    normalize?: (data: unknown) => unknown,
  ) {
    const rawMult = Number(chargeMult);
    const mult = Number.isFinite(rawMult) && rawMult > 0 ? rawMult : 1;
    const amount = this.sunoMusicService.sunoBaseDeduct(row as any) * mult;
    await this.userBalanceService.validateBalance(req, row.deductType, amount);
    const out = await fn();
    if (!isSuccess(out.status, out.data)) {
      this.throwUpstreamFailure(out.status, out.data);
    }
    await this.userBalanceService.deductFromBalance(
      req.user.id,
      row.deductType,
      amount,
      0,
      JSON.stringify({ scene, mult }),
    );
    return normalize ? normalize(out.data) : out.data;
  }

  private withBalance(
    req: Request,
    row: { deduct: number; deductType: number },
    chargeMult: number,
    fn: () => Promise<{ status: number; data: unknown }>,
  ) {
    return this.withCharge(
      req,
      row,
      chargeMult,
      'suno_music',
      (s, d) => this.sunoMusicService.isGenerateSuccess(s, d),
      fn,
      d => this.sunoMusicService.normalizeGenerateResponse(d),
    );
  }

  private assertUpstreamReadOk(status: number, data: unknown) {
    if (status < 200 || status >= 300) {
      this.throwUpstreamFailure(status, data);
    }
    const err = this.sunoMusicService.extractErrorMessage(data);
    if (err) {
      throw new HttpException(
        humanizeSunoUpstreamError(err, HttpStatus.BAD_GATEWAY),
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('jobs')
  @ApiOperation({ summary: '列举当前账号 Suno 音乐任务' })
  async listJobs(@Req() req: Request, @Query('limit') limit?: string) {
    const lim = Math.min(100, Math.max(1, parseInt(String(limit || '80'), 10) || 80));
    const rows = await this.sunoMusicJobService.listForUser(req.user.id, lim);
    const syncSeq = await this.getMusicJobsSyncSeq(req.user.id);
    return { list: rows.map(r => this.jobEntityToDto(r)), syncSeq };
  }

  @Post('jobs/batch-upsert')
  @ApiOperation({ summary: '批量同步 Suno 任务快照' })
  async batchUpsertJobs(
    @Req() req: Request,
    @Body() body: { jobs?: CreateSunoMusicJobDto[]; baseSyncSeq?: number },
  ) {
    const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
    const uid = req.user.id;
    const serverSeq = await this.getMusicJobsSyncSeq(uid);
    const clientSeq = body?.baseSyncSeq;
    if (clientSeq !== undefined && clientSeq !== null && String(clientSeq) !== '') {
      const c = Number(clientSeq);
      if (Number.isFinite(c) && c !== serverSeq) {
        return { synced: 0, stale: true as const, syncSeq: serverSeq };
      }
    }
    const n = await this.sunoMusicJobService.batchUpsert(uid, jobs);
    return { synced: n, syncSeq: serverSeq };
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: '删除 Suno 任务记录' })
  async deleteJob(@Req() req: Request, @Param('id') id: string) {
    const nid = parseInt(String(id || '').trim(), 10);
    if (!Number.isFinite(nid) || nid < 1) {
      throw new BadRequestException('无效的任务 id');
    }
    await this.sunoMusicJobService.delete(req.user.id, nid);
    const syncSeq = await this.bumpMusicJobsSyncSeq(req.user.id);
    return { ok: true, syncSeq };
  }

  @Post('lyrics/submit')
  @ApiOperation({ summary: 'Suno 生成歌词（submit/lyrics 或 generate/lyrics）' })
  async lyricsSubmit(
    @Req() req: Request,
    @Body() body: { model: string; prompt: string; chargeMult?: number },
  ) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) throw new BadRequestException('缺少歌词提示词 prompt');
    const path = this.sunoMusicService.lyricsSubmitPath(row);
    const mult = Number(body.chargeMult) || SUNO_LYRICS_CHARGE_MULT;
    return this.withCharge(
      req,
      row,
      mult,
      'suno_lyrics',
      (s, d) => this.sunoMusicService.isLyricsSubmitSuccess(s, d),
      () => this.sunoMusicService.requestUpstream(row, path, { data: { prompt } }),
      d => this.sunoMusicService.normalizeLyricsSubmitResponse(d),
    );
  }

  @Get('lyrics/fetch/:taskId')
  @ApiOperation({ summary: '轮询歌词任务（fetch 或 lyrics）' })
  async lyricsFetch(@Param('taskId') taskId: string, @Query('model') model: string) {
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const tid = String(taskId || '').trim();
    if (!tid) throw new BadRequestException('缺少 task_id');
    const path = this.sunoMusicService.lyricsFetchPath(row, tid);
    const out = await this.sunoMusicService.requestUpstream(row, path, { method: 'GET' });
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.normalizeLyricsPollResponse(out.data);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Suno 音乐生成（/suno/generate）' })
  async generate(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      payload: Record<string, unknown>;
      chargeMult?: number;
    },
  ) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    let payload = body.payload;
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('缺少 payload');
    }
    payload = this.sunoMusicService.adaptGeneratePayloadForUpstream(row, payload);
    let mult = Number(body.chargeMult) || 1;
    const task = String(payload.task || '').trim();
    const stemTask = String(payload.stem_task || '').trim();
    if (task === 'all-stems' || (task === 'gen_stem' && stemTask === 'twelve')) {
      mult = SUNO_ALL_STEMS_CHARGE_MULT;
    }
    return this.withBalance(req, row, mult, () =>
      this.sunoMusicService.requestUpstream(row, '/suno/generate', { data: payload }),
    );
  }

  @Get('feed/:clipsIds')
  @ApiOperation({ summary: '查询 clip 状态（/suno/feed）' })
  async feed(@Param('clipsIds') clipsIds: string, @Query('model') model: string) {
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const ids = String(clipsIds || '').trim();
    if (!ids) throw new BadRequestException('缺少 clip_id');

    const flavor = this.sunoMusicService.getApiFlavor(row);
    const idList = ids
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    /** ephone 等：提交返回 task_id，仅 GET /suno/fetch/{task_id}（勿用 feed+task_id，会 404） */
    if (flavor === 'submit') {
      const merged: Record<string, unknown>[] = [];
      for (const tid of idList) {
        const out = await this.sunoMusicService.requestUpstream(
          row,
          `/suno/fetch/${encodeURIComponent(tid)}`,
          { method: 'GET' },
        );
        if (out.status >= 400) {
          const err = this.sunoMusicService.extractErrorMessage(out.data);
          if (isBenignSunoFeedMiss(err)) continue;
          throw new HttpException(
            humanizeSunoUpstreamError(err || `查询任务失败 HTTP ${out.status}`, out.status),
            out.status >= 500 ? HttpStatus.BAD_GATEWAY : out.status,
          );
        }
        try {
          const part = extractClipsFromSunoFetchTask(out.data, tid);
          merged.push(...part);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (isBenignSunoFeedMiss(msg)) continue;
          throw new HttpException(
            humanizeSunoUpstreamError(msg, HttpStatus.BAD_GATEWAY),
            HttpStatus.BAD_GATEWAY,
          );
        }
      }
      return merged;
    }

    const out = await this.sunoMusicService.requestUpstream(
      row,
      `/suno/feed/${encodeURIComponent(ids)}`,
      { method: 'GET' },
    );
    const feedErr = this.sunoMusicService.extractErrorMessage(out.data);
    if (out.status >= 400) {
      if (isBenignSunoFeedMiss(feedErr)) return [];
      this.throwUpstreamFailure(out.status, out.data);
    }
    if (feedErr && isBenignSunoFeedMiss(feedErr)) return [];
    this.assertUpstreamReadOk(out.status, out.data);
    const body = this.sunoMusicService.unwrapUpstreamBody(out.data);
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      if (Array.isArray(o.clips)) return o.clips;
    }
    return out.data;
  }

  @Post('act/tags')
  @ApiOperation({ summary: '扩展风格 tags' })
  async expandTags(@Body() body: { model: string; original_tags: string }) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const out = await this.sunoMusicService.requestUpstream(row, '/suno/act/tags', {
      data: { original_tags: String(body.original_tags || '').trim() },
    });
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.normalizeTagsResponse(out.data);
  }

  @Get('act/midi/:clipId')
  @ApiOperation({ summary: '获取 MIDI（轮询直到 complete）' })
  async getMidi(@Param('clipId') clipId: string, @Query('model') model: string) {
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const id = String(clipId || '').trim();
    if (!id) throw new BadRequestException('缺少 clip_id');
    const out = await this.sunoMusicService.requestUpstream(
      row,
      `/suno/act/midi/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.unwrapUpstreamBody(out.data);
  }

  @Post('upload/url')
  @ApiOperation({ summary: '通过 URL 上传音频（/suno/uploads/audio-url）' })
  async uploadByUrl(@Body() body: { model: string; url: string }) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const audioUrl = String(body.url || '').trim();
    if (!audioUrl) throw new BadRequestException('缺少 url');
    const out = await this.sunoMusicService.requestUpstream(row, '/suno/uploads/audio-url', {
      data: { url: audioUrl },
    });
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.unwrapUpstreamBody(out.data);
  }

  @Post('fetch/batch')
  @ApiOperation({ summary: '批量查询任务（POST /suno/fetch）' })
  async fetchBatch(@Body() body: { model: string; ids: string[]; action?: string }) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) throw new BadRequestException('缺少 ids');
    const action = String(body.action || 'MUSIC').trim() || 'MUSIC';
    const out = await this.sunoMusicService.requestUpstream(row, '/suno/fetch', {
      data: { ids, action },
    });
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.unwrapUpstreamBody(out.data);
  }

  @Post('act/vox/:clipId')
  @ApiOperation({ summary: '提取人声片段 vox' })
  async getVox(
    @Req() req: Request,
    @Param('clipId') clipId: string,
    @Body()
    body: { model: string; vocal_start_s: number; vocal_end_s: number; chargeMult?: number },
  ) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const id = String(clipId || '').trim();
    if (!id) throw new BadRequestException('缺少 clip_id');
    const start = Number(body.vocal_start_s);
    const end = Number(body.vocal_end_s);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new BadRequestException('无效的人声时间区间');
    }
    return this.withCharge(
      req,
      row,
      Number(body.chargeMult) || 1,
      'suno_vox',
      (s, d) => s >= 200 && s < 300,
      () =>
        this.sunoMusicService.requestUpstream(row, `/suno/act/vox/${encodeURIComponent(id)}`, {
          data: { vocal_start_s: start, vocal_end_s: end },
        }),
      d => this.sunoMusicService.unwrapUpstreamBody(d),
    );
  }

  @Post('upload')
  @ApiOperation({ summary: '上传音频（multipart → /suno/upload）' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
    @Body('model') model: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('缺少音频文件');
    }
    const row = await this.sunoMusicService.resolveSunoModel(model);
    return this.sunoUploadService.uploadAudioSmart(row, file, req.user);
  }

  @Post('upload/pipeline')
  @ApiOperation({ summary: 'S3 多步上传（init→S3→finish→poll→initialize-clip）' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadPipeline(
    @Req() req: Request,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string },
    @Body('model') model: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('缺少音频文件');
    }
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const flavor = this.sunoMusicService.getApiFlavor(row);
    if (flavor === 'submit') {
      return this.sunoUploadService.uploadAudioSmart(row, file, req.user);
    }
    return this.sunoUploadService.uploadViaPipeline(row, file, req.user);
  }

  @Post('submit/concat')
  @ApiOperation({ summary: '歌曲拼接（续写后合并完整曲）' })
  async concat(
    @Req() req: Request,
    @Body() body: { model: string; clip_id: string; is_infill?: boolean; chargeMult?: number },
  ) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const clipId = String(body.clip_id || '').trim();
    if (!clipId) throw new BadRequestException('缺少 clip_id');
    return this.withCharge(
      req,
      row,
      Number(body.chargeMult) || 1,
      'suno_concat',
      (s, d) => this.sunoMusicService.isConcatSuccess(s, d),
      () => this.sunoMusicService.requestConcat(row, clipId, body.is_infill === true),
      d => this.sunoMusicService.normalizeGenerateResponse(d),
    );
  }

  @Post('persona/create')
  @ApiOperation({ summary: '新建 Persona（歌手风格）' })
  async personaCreate(
    @Req() req: Request,
    @Body()
    body: {
      model: string;
      root_clip_id: string;
      name: string;
      description: string;
      clips: string[];
      is_public?: boolean;
      chargeMult?: number;
    },
  ) {
    const row = await this.sunoMusicService.resolveSunoModel(body.model);
    const root = String(body.root_clip_id || '').trim();
    if (!root) throw new BadRequestException('缺少 root_clip_id');
    const clips = Array.isArray(body.clips) ? body.clips.map(String).filter(Boolean) : [root];
    return this.withCharge(
      req,
      row,
      Number(body.chargeMult) || 1,
      'suno_persona',
      (s, d) => this.sunoMusicService.isPersonaCreateSuccess(s, d),
      () =>
        this.sunoMusicService.requestUpstream(row, '/suno/persona/create', {
          data: {
            root_clip_id: root,
            name: String(body.name || '').trim() || 'Persona',
            description: String(body.description || '').trim(),
            clips,
            is_public: body.is_public !== false,
          },
        }),
      d => this.sunoMusicService.normalizePersonaCreateResponse(d),
    );
  }

  @Get('act/wav/:clipId')
  @ApiOperation({ summary: '获取 WAV 文件 URL' })
  async getWav(@Param('clipId') clipId: string, @Query('model') model: string) {
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const id = String(clipId || '').trim();
    if (!id) throw new BadRequestException('缺少 clip_id');
    const out = await this.sunoMusicService.requestUpstream(
      row,
      `/suno/act/wav/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.unwrapUpstreamBody(out.data);
  }

  @Get('act/mp4/:clipId')
  @ApiOperation({ summary: '生成 MP4 MV 视频 URL' })
  async getMp4(@Param('clipId') clipId: string, @Query('model') model: string) {
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const id = String(clipId || '').trim();
    if (!id) throw new BadRequestException('缺少 clip_id');
    const out = await this.sunoMusicService.requestUpstream(
      row,
      `/suno/act/mp4/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.unwrapUpstreamBody(out.data);
  }

  @Get('act/timing/:clipId')
  @ApiOperation({ summary: '歌词时间轴 Timing' })
  async getTiming(@Param('clipId') clipId: string, @Query('model') model: string) {
    const row = await this.sunoMusicService.resolveSunoModel(model);
    const id = String(clipId || '').trim();
    if (!id) throw new BadRequestException('缺少 clip_id');
    const out = await this.sunoMusicService.requestUpstream(
      row,
      `/suno/act/timing/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    this.assertUpstreamReadOk(out.status, out.data);
    return this.sunoMusicService.unwrapUpstreamBody(out.data);
  }
}
