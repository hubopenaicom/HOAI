import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSecurityLogEntity } from './userSecurityLog.entity';

export interface AppendUserSecurityLogParams {
  userId: number;
  action: string;
  meta: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class UserSecurityLogService {
  constructor(
    @InjectRepository(UserSecurityLogEntity)
    private readonly logRepo: Repository<UserSecurityLogEntity>,
  ) {}

  async append(params: AppendUserSecurityLogParams): Promise<void> {
    await this.logRepo.save({
      userId: params.userId,
      action: params.action,
      meta: JSON.stringify(params.meta ?? {}),
      ip: (params.ip || '').slice(0, 128),
    });
  }

  async queryAdmin(params: {
    page?: number;
    size?: number;
    userId?: number;
    action?: string;
  }): Promise<{ rows: UserSecurityLogEntity[]; count: number }> {
    const page = Math.max(1, Number(params.page) || 1);
    const size = Math.min(100, Math.max(1, Number(params.size) || 15));
    const qb = this.logRepo.createQueryBuilder('l').orderBy('l.id', 'DESC');
    if (params.userId != null && String(params.userId) !== '') {
      qb.andWhere('l.userId = :userId', { userId: Number(params.userId) });
    }
    if (params.action && String(params.action).trim()) {
      qb.andWhere('l.action = :action', { action: String(params.action).trim() });
    }
    const [rows, count] = await qb
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();
    return { rows, count };
  }
}
