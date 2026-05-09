import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrawingMjJobEntity } from './drawing-mj-job.entity';

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
  ) {}

  async listForUser(userId: number, limit: number): Promise<DrawingMjJobEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { id: 'DESC' },
      take: limit,
    });
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
    if (ck) {
      const existing = await this.repo.findOne({ where: { userId, clientKey: ck } });
      if (existing) {
        if (dto.taskId !== undefined) existing.taskId = dto.taskId ?? null;
        if (dto.loading !== undefined) existing.loading = dto.loading;
        if (dto.error !== undefined) existing.error = dto.error ?? null;
        if (dto.promptLabel !== undefined) existing.promptLabel = dto.promptLabel;
        if (dto.modelKey !== undefined) existing.modelKey = dto.modelKey;
        if (dto.mjMode !== undefined) existing.mjMode = dto.mjMode;
        if (dto.mjStyleSnapshot !== undefined) existing.mjStyleSnapshot = dto.mjStyleSnapshot ?? null;
        if (dto.task !== undefined) {
          existing.taskJson = dto.task ? JSON.stringify(dto.task) : null;
        }
        return this.repo.save(existing);
      }
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
}
