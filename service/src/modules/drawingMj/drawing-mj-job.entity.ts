import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

/** 绘画页 Midjourney 任务持久化（按用户账号，可跨设备） */
@Entity({ name: 'drawing_mj_job' })
@Index(['userId', 'id'])
export class DrawingMjJobEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ length: 24, nullable: true, comment: '客户端 localId，便于对齐与去重' })
  clientKey: string;

  @Column({ length: 191, nullable: true, comment: 'MJ 上游任务 ID' })
  taskId: string;

  @Column({ length: 191, comment: '模型 model 字段' })
  modelKey: string;

  @Column({ length: 32, comment: 'fast|turbo|relax' })
  mjMode: string;

  @Column({ length: 32, nullable: true, comment: '写实|动漫等' })
  mjStyleSnapshot: string;

  @Column({ type: 'text', comment: '提示或任务摘要' })
  promptLabel: string;

  @Column({ default: true, comment: '是否仍在前端视为进行中' })
  loading: boolean;

  @Column({ type: 'text', nullable: true, comment: '失败原因' })
  error: string;

  @Column({ type: 'longtext', nullable: true, comment: '上游 task/fetch 解析后的 JSON' })
  taskJson: string;

  @Column({ type: 'int', nullable: true, comment: '本次提交扣费积分（与 withBalance 估算一致）' })
  deductCharged: number | null;

  @Column({
    type: 'smallint',
    nullable: true,
    comment: '扣费倍率（Imagine/Shorten 由提示词推断等）',
  })
  chargeMult: number | null;

  @Column({ type: 'tinyint', nullable: true, comment: '扣费类型快照：1 普通 2 高级 3 绘画' })
  deductTypeSnapshot: number | null;
}
