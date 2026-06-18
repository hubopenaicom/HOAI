import { maskEmail } from '@/common/utils';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Brackets, In, Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { QueryAdminSunoMusicJobsDto } from './dto/queryAdminSunoMusicJobs.dto';
import { SunoMusicJobEntity } from './suno-music-job.entity';
import { extractStudioMetaFromClip } from './suno-job-cloud.util';

export interface CreateSunoMusicJobDto {
  clientKey?: number | string;
  clipId?: string;
  modelKey: string;
  sceneLabel?: string;
  promptLabel: string;
  status?: string;
  loading?: boolean;
  error?: string;
  clip?: Record<string, unknown>;
  deductCharged?: number | null;
  chargeMult?: number | null;
  deductTypeSnapshot?: number | null;
}

@Injectable()
export class SunoMusicJobService {
  constructor(
    @InjectRepository(SunoMusicJobEntity)
    private readonly repo: Repository<SunoMusicJobEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async listForUser(userId: number, limit: number): Promise<SunoMusicJobEntity[]> {
    const cap = Math.min(Math.max(limit * 6, limit), 400);
    const rows = await this.repo.find({
      where: { userId },
      order: { id: 'DESC' },
      take: cap,
    });
    const seen = new Set<string>();
    const out: SunoMusicJobEntity[] = [];
    for (const r of rows) {
      let clip: Record<string, unknown> | undefined;
      try {
        if (r.clipJson) clip = JSON.parse(r.clipJson) as Record<string, unknown>;
      } catch {
        clip = undefined;
      }
      const meta = extractStudioMetaFromClip(clip);
      // 声曲分离子轨仅挂在源曲弹窗，不占主任务列表配额
      if (meta.parentClipId) continue;

      const ck = r.clientKey?.trim() || '';
      const k = ck ? `ck:${ck}` : `id:${r.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  private async dedupeByClientKey(userId: number, clientKey: string, keepId: number) {
    const ck = clientKey.trim();
    if (!ck) return;
    const rows = await this.repo.find({ where: { userId, clientKey: ck } });
    const toRemove = rows.filter(r => r.id !== keepId);
    if (toRemove.length) await this.repo.remove(toRemove);
  }

  async upsert(userId: number, dto: CreateSunoMusicJobDto): Promise<SunoMusicJobEntity> {
    const ck = dto.clientKey != null ? String(dto.clientKey) : null;
    let saved: SunoMusicJobEntity;
    const patch = (row: SunoMusicJobEntity) => {
      if (dto.clipId !== undefined) row.clipId = dto.clipId ?? null;
      if (dto.loading !== undefined) row.loading = dto.loading;
      if (dto.error !== undefined) row.error = dto.error ?? null;
      if (dto.promptLabel !== undefined) row.promptLabel = dto.promptLabel;
      if (dto.modelKey !== undefined) row.modelKey = dto.modelKey;
      if (dto.sceneLabel !== undefined) row.sceneLabel = dto.sceneLabel ?? null;
      if (dto.status !== undefined) row.status = dto.status ?? 'submitted';
      if (dto.clip !== undefined) {
        row.clipJson = dto.clip ? JSON.stringify(dto.clip) : null;
      }
      if (dto.deductCharged !== undefined) row.deductCharged = dto.deductCharged;
      if (dto.chargeMult !== undefined) row.chargeMult = dto.chargeMult;
      if (dto.deductTypeSnapshot !== undefined) row.deductTypeSnapshot = dto.deductTypeSnapshot;
    };
    if (ck) {
      const existing = await this.repo.findOne({ where: { userId, clientKey: ck } });
      if (existing) {
        patch(existing);
        saved = await this.repo.save(existing);
      } else {
        saved = await this.create(userId, dto);
      }
      await this.dedupeByClientKey(userId, ck, saved.id);
      return saved;
    }
    return this.create(userId, dto);
  }

  async create(userId: number, dto: CreateSunoMusicJobDto): Promise<SunoMusicJobEntity> {
    const row = this.repo.create({
      userId,
      clientKey: dto.clientKey != null ? String(dto.clientKey) : null,
      clipId: dto.clipId ?? null,
      modelKey: dto.modelKey,
      sceneLabel: dto.sceneLabel ?? null,
      promptLabel: dto.promptLabel,
      status: dto.status ?? 'submitted',
      loading: dto.loading !== false,
      error: dto.error ?? null,
      clipJson: dto.clip ? JSON.stringify(dto.clip) : null,
      deductCharged: dto.deductCharged ?? null,
      chargeMult: dto.chargeMult ?? null,
      deductTypeSnapshot: dto.deductTypeSnapshot ?? null,
    });
    return this.repo.save(row);
  }

  async batchUpsert(userId: number, jobs: CreateSunoMusicJobDto[]): Promise<number> {
    let n = 0;
    for (const dto of jobs.slice(0, 80)) {
      if (dto.clientKey == null || !dto.modelKey?.trim()) continue;
      await this.upsert(userId, dto);
      n += 1;
    }
    return n;
  }

  async delete(userId: number, id: number): Promise<void> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('任务不存在');
    const ck = row.clientKey?.trim() || '';
    await this.repo.remove(row);
    if (ck) {
      const rest = await this.repo.find({ where: { userId, clientKey: ck } });
      if (rest.length) await this.repo.remove(rest);
    }
  }

  async adminQueryJobs(params: QueryAdminSunoMusicJobsDto, req: Request) {
    const page = Math.max(1, Number(params.page) || 1);
    const size = Math.min(100, Math.max(1, Number(params.size) || 20));
    const qb = this.repo.createQueryBuilder('j');
    if (params.userId != null && String(params.userId).trim() !== '') {
      const uid = Number(params.userId);
      if (Number.isFinite(uid)) qb.andWhere('j.userId = :userId', { userId: uid });
    }
    if (params.modelKey?.trim()) {
      qb.andWhere('j.modelKey = :modelKey', { modelKey: params.modelKey.trim() });
    }
    if (params.clipId?.trim()) {
      qb.andWhere('j.clipId = :clipId', { clipId: params.clipId.trim() });
    }
    if (params.status?.trim()) {
      qb.andWhere('j.status = :status', { status: params.status.trim() });
    }
    const loadingRaw = params.loading;
    if (loadingRaw === '1' || loadingRaw === 'true')
      qb.andWhere('j.loading = :loading', { loading: true });
    else if (loadingRaw === '0' || loadingRaw === 'false')
      qb.andWhere('j.loading = :loading', { loading: false });
    const kw = params.keyword?.trim() || '';
    if (kw) {
      const like = `%${kw}%`;
      qb.andWhere(
        new Brackets(w => {
          w.where('j.promptLabel LIKE :kw', { kw: like })
            .orWhere('j.clipId LIKE :kw', { kw: like })
            .orWhere('j.sceneLabel LIKE :kw', { kw: like });
        }),
      );
    }
    qb.orderBy('j.id', 'DESC')
      .skip((page - 1) * size)
      .take(size);
    const [rows, count] = await qb.getManyAndCount();
    const userIds = [...new Set(rows.map(r => r.userId))];
    const users =
      userIds.length > 0
        ? await this.userRepo.find({
            where: { id: In(userIds) },
            select: ['id', 'username', 'email', 'nickname'],
          })
        : [];
    const isSuper = req.user?.role === 'super';
    const mapped = rows.map(item => {
      let clip: Record<string, unknown> | undefined;
      try {
        if (item.clipJson) clip = JSON.parse(item.clipJson) as Record<string, unknown>;
      } catch {
        clip = undefined;
      }
      const u = users.find(x => x.id === item.userId);
      let email = u?.email;
      if (!isSuper && email) email = maskEmail(email);
      const audioUrl =
        clip?.audio_url != null
          ? String(clip.audio_url)
          : clip?.audioUrl != null
          ? String(clip.audioUrl)
          : undefined;
      const imageUrl =
        clip?.image_url != null
          ? String(clip.image_url)
          : clip?.imageUrl != null
          ? String(clip.imageUrl)
          : undefined;
      const studio = extractStudioMetaFromClip(clip);
      return {
        id: item.id,
        userId: item.userId,
        username: u?.username,
        nickname: u?.nickname,
        email: email ?? `${item.userId}@aiweb.com`,
        clientKey: item.clientKey,
        clipId: item.clipId ?? '',
        modelKey: item.modelKey,
        sceneLabel: item.sceneLabel ?? undefined,
        promptLabel: item.promptLabel,
        status: item.status,
        loading: !!item.loading,
        error: item.error ?? undefined,
        clip,
        audioUrl,
        imageUrl,
        taskId: studio.taskId,
        isUploadClip: studio.isUploadClip,
        parentClipId: studio.parentClipId,
        stemGroupId: studio.stemGroupId,
        stemKind: studio.stemKind,
        deductCharged: item.deductCharged,
        chargeMult: item.chargeMult,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });
    return { rows: mapped, count };
  }
}
