import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 用户侧安全类操作审计（如邮箱绑定/换绑），供管理端查询。
 */
@Entity({ name: 'user_security_log' })
export class UserSecurityLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({
    type: 'datetime',
    length: 0,
    nullable: false,
    name: 'createdAt',
    comment: '创建时间',
  })
  createdAt: Date;

  @Column({ name: 'user_id', comment: '用户ID' })
  userId: number;

  @Column({ length: 64, comment: '动作类型，如 EMAIL_BIND / EMAIL_REBIND' })
  action: string;

  @Column({ type: 'text', nullable: true, comment: 'JSON 扩展信息' })
  meta: string;

  @Column({ length: 128, nullable: true, comment: '请求 IP' })
  ip: string;
}
