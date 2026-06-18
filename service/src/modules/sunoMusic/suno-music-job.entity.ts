import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'suno_music_job' })
@Index(['userId', 'id'])
export class SunoMusicJobEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({ length: 32, nullable: true, comment: '客户端 localId' })
  clientKey: string;

  @Column({ length: 64, nullable: true, comment: 'Suno clip_id' })
  clipId: string;

  @Column({ length: 191, comment: '模型 model 字段' })
  modelKey: string;

  @Column({ length: 48, nullable: true, comment: '场景标签' })
  sceneLabel: string;

  @Column({ type: 'text', comment: '标题或摘要' })
  promptLabel: string;

  @Column({ length: 32, default: 'submitted', comment: '任务状态' })
  status: string;

  @Column({ default: true, comment: '是否进行中' })
  loading: boolean;

  @Column({ type: 'text', nullable: true, comment: '失败原因' })
  error: string;

  @Column({ type: 'longtext', nullable: true, comment: 'feed 片段 JSON' })
  clipJson: string;

  @Column({ type: 'int', nullable: true, comment: '扣费积分' })
  deductCharged: number | null;

  @Column({ type: 'smallint', nullable: true, comment: '扣费倍数' })
  chargeMult: number | null;

  @Column({ type: 'tinyint', nullable: true, comment: '扣费类型快照' })
  deductTypeSnapshot: number | null;
}
