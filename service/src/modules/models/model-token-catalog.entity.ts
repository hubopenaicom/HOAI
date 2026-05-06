import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

/** 模型 Token 限额维护表（OpenRouter / LiteLLM 同步 + 手工） */
@Entity({ name: 'model_token_catalog' })
export class ModelTokenCatalogEntity extends BaseEntity {
  @Column({
    length: 512,
    unique: true,
    comment: 'API 模型 ID，与模型配置里「账号关联模型」一致，如 openai/gpt-4o',
  })
  modelId: string;

  @Column({ length: 512, nullable: true, comment: '展示名称（可选）' })
  displayName: string;

  @Column({ type: 'int', comment: '上下文 Tokens（最大输入窗口）' })
  maxModelTokens: number;

  @Column({ type: 'int', comment: '单次回复 Tokens 上限' })
  max_tokens: number;

  /** manual | openrouter | litellm | merged */
  @Column({ length: 32, comment: '数据来源' })
  source: string;

  @Column({ default: false, comment: '锁定后批量同步将跳过（手工维护建议锁定）' })
  locked: boolean;

  @Column({ type: 'text', nullable: true, comment: '备注' })
  remark: string;
}
