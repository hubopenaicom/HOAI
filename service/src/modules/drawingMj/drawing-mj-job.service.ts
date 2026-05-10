import { maskEmail } from '@/common/utils';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Brackets, In, Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { QueryAdminDrawingMjJobsDto } from './dto/queryAdminDrawingMjJobs.dto';
import { DrawingMjJobEntity } from './drawing-mj-job.entity';
import { collectMjImageUrls } from './mj-task-image-urls';

export interface CreateDrawingMjJobDto {
  clientKey?: number;
  taskId?: string;
  modelKey: string;
  mjMode: string;
  mjStyleSnapshot?: string;
  promptLabel: string;
  loading?: boolean;
  error?: string;
  task?: Record<string, unknown>;
}

export interface UpdateDrawingMjJobDto {
  taskId?: string;
  loading?: boolean;
  error?: string;
  task?: Record<string, unknown>;
  promptLabel?: string;
}

@Injectable()
export class DrawingMjJobService {
  constructor(
    @InjectRepository(DrawingMjJobEntity)
    private readonly repo: Repository<DrawingMjJobEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /**
   * 同一 userId + clientKey 历史上可能有多行（并发 upsert / 旧版逻辑），列表只保留 id 最新的一条，
   * 避免删一条后刷新仍看到「同任务」的另一行。
   */
  async listForUser(userId: number, limit: number): Promise<DrawingMjJobEntity[]> {
    const cap = Math.min(Math.max(limit * 4, limit), 400);
    const rows = await this.repo.find({
      where: { userId },
      order: { id: 'DESC' },
      take: cap,
    });
    const seen = new Set<string>();
    const out: DrawingMjJobEntity[] = [];
    for (const r of rows) {
      const ck = r.clientKey != null ? String(r.clientKey).trim() : '';
      const k = ck !== '' ? `ck:${ck}` : `id:${r.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** 保留 keepId 对应行，删掉同 userId+clientKey 的其余行（避免误删刚 upsert 的那条） */
  private async dedupeByClientKey(
    userId: number,
    clientKey: string,
    keepId: number,
  ): Promise<void> {
    const ck = clientKey.trim();
    if (!ck) return;
    const rows = await this.repo.find({ where: { userId, clientKey: ck } });
    const toRemove = rows.filter(r => r.id !== keepId);
    if (toRemove.length) await this.repo.remove(toRemove);
  }

  async create(userId: number, dto: CreateDrawingMjJobDto): Promise<DrawingMjJobEntity> {
    const row = this.repo.create({
      userId,
      clientKey: dto.clientKey != null ? String(dto.clientKey) : null,
      taskId: dto.taskId ?? null,
      modelKey: dto.modelKey,
      mjMode: dto.mjMode,
      mjStyleSnapshot: dto.mjStyleSnapshot ?? null,
      promptLabel: dto.promptLabel,
      loading: dto.loading !== false,
      error: dto.error ?? null,
      taskJson: dto.task ? JSON.stringify(dto.task) : null,
    });
    return this.repo.save(row);
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateDrawingMjJobDto,
  ): Promise<DrawingMjJobEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException('任务不存在');
    }
    if (dto.taskId !== undefined) row.taskId = dto.taskId;
    if (dto.loading !== undefined) row.loading = dto.loading;
    if (dto.error !== undefined) row.error = dto.error;
    if (dto.promptLabel !== undefined) row.promptLabel = dto.promptLabel;
    if (dto.task !== undefined) {
      row.taskJson = dto.task ? JSON.stringify(dto.task) : null;
    }
    return this.repo.save(row);
  }

  /** 按 userId + clientKey 幂等更新；无则插入 */
  async upsert(userId: number, dto: CreateDrawingMjJobDto): Promise<DrawingMjJobEntity> {
    const ck = dto.clientKey != null ? String(dto.clientKey) : null;
    let saved: DrawingMjJobEntity;
    if (ck) {
      const existing = await this.repo.findOne({ where: { userId, clientKey: ck } });
      if (existing) {
        if (dto.taskId !== undefined) existing.taskId = dto.taskId ?? null;
        if (dto.loading !== undefined) existing.loading = dto.loading;
        if (dto.error !== undefined) existing.error = dto.error ?? null;
        if (dto.promptLabel !== undefined) existing.promptLabel = dto.promptLabel;
        if (dto.modelKey !== undefined) existing.modelKey = dto.modelKey;
        if (dto.mjMode !== undefined) existing.mjMode = dto.mjMode;
        if (dto.mjStyleSnapshot !== undefined)
          existing.mjStyleSnapshot = dto.mjStyleSnapshot ?? null;
        if (dto.task !== undefined) {
          existing.taskJson = dto.task ? JSON.stringify(dto.task) : null;
        }
        saved = await this.repo.save(existing);
      } else {
        saved = await this.create(userId, dto);
      }
      await this.dedupeByClientKey(userId, ck, saved.id);
      return saved;
    }
    return this.create(userId, dto);
  }

  async batchUpsert(userId: number, jobs: CreateDrawingMjJobDto[]): Promise<number> {
    let n = 0;
    for (const dto of jobs.slice(0, 80)) {
      if (dto.clientKey == null || !dto.modelKey || !String(dto.modelKey).trim()) {
        continue;
      }
      await this.upsert(userId, dto);
      n += 1;
    }
    return n;
  }

  async delete(userId: number, id: number): Promise<void> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException('任务不存在');
    }
    const ck = row.clientKey != null ? String(row.clientKey).trim() : '';
    await this.repo.remove(row);
    if (ck !== '') {
      const rest = await this.repo.find({ where: { userId, clientKey: ck } });
      if (rest.length) await this.repo.remove(rest);
    }
  }

  /** 后台分页：关联用户、解析任务 JSON、提取预览图 URL */
  async adminQueryJobs(params: QueryAdminDrawingMjJobsDto, req: Request) {
    const page = Math.max(1, Number(params.page) || 1);
    const size = Math.min(100, Math.max(1, Number(params.size) || 20));
    const { userId, keyword, modelKey, taskId } = params;
    const loadingRaw = params.loading;
    let loadingFilter: boolean | undefined;
    if (loadingRaw === '1' || loadingRaw === 'true') loadingFilter = true;
    else if (loadingRaw === '0' || loadingRaw === 'false') loadingFilter = false;

    const qb = this.repo.createQueryBuilder('j');
    if (userId != null && String(userId).trim() !== '') {
      const uid = Number(userId);
      if (Number.isFinite(uid)) qb.andWhere('j.userId = :userId', { userId: uid });
    }
    if (modelKey != null && String(modelKey).trim() !== '') {
      qb.andWhere('j.modelKey = :modelKey', { modelKey: String(modelKey).trim() });
    }
    if (taskId != null && String(taskId).trim() !== '') {
      qb.andWhere('j.taskId = :taskId', { taskId: String(taskId).trim() });
    }
    if (loadingFilter !== undefined) {
      qb.andWhere('j.loading = :loading', { loading: loadingFilter });
    }
    const kw = keyword != null ? String(keyword).trim() : '';
    if (kw) {
      const like = `%${kw}%`;
      qb.andWhere(
        new Brackets(w => {
          w.where('j.promptLabel LIKE :mjKw', { mjKw: like }).orWhere('j.taskId LIKE :mjKw', {
            mjKw: like,
          });
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
      let task: Record<string, unknown> | undefined;
      try {
        if (item.taskJson) task = JSON.parse(item.taskJson) as Record<string, unknown>;
      } catch {
        task = undefined;
      }
      const u = users.find(x => x.id === item.userId);
      let email = u?.email;
      if (!isSuper && email) email = maskEmail(email);
      const ck = item.clientKey ? Number(item.clientKey) : undefined;
      return {
        id: item.id,
        userId: item.userId,
        username: u?.username,
        nickname: u?.nickname,
        email: email ?? (!u ? `${item.userId}@aiweb.com` : email),
        clientKey: Number.isFinite(ck as number) ? ck : undefined,
        taskId: item.taskId ?? '',
        modelKey: item.modelKey,
        mjMode: item.mjMode,
        mjStyleSnapshot: item.mjStyleSnapshot ?? undefined,
        promptLabel: item.promptLabel,
        loading: !!item.loading,
        error: item.error ?? undefined,
        task,
        imageUrls: collectMjImageUrls(task),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    mapped.forEach(t => {
      if (!t.email && t.userId) t.email = `${t.userId}@aiweb.com`;
      if (!t.username && t.userId) t.username = `游客${t.userId}`;
    });

    return { rows: mapped, count };
  }
}
