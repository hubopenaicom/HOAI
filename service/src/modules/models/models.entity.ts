import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity } from 'typeorm';

@Entity({ name: 'models' })
export class ModelsEntity extends BaseEntity {
  @Column({ comment: '模型类型 1: 基础对话 2: 创意模型(绘画/音乐等插件) 3: 特殊模型' })
  keyType: number;

  @Column({ comment: '模型名称' })
  modelName: string;

  @Column({ comment: '绑定的模型是？' })
  model: string;

  @Column({ length: 1024, comment: '模型头像', nullable: true })
  modelAvatar: string;

  @Column({ comment: '模型排序', default: 1 })
  modelOrder: number;

  @Column({
    comment: '模型上下文支持的最大Tokens',
    default: 64000,
    nullable: true,
  })
  maxModelTokens: number;

  @Column({ comment: '模型回复最大Tokens', default: 4096, nullable: true })
  max_tokens: number;

  @Column({ comment: '模型上下文最大条数', nullable: true })
  maxRounds: number;

  @Column({ comment: '模型上下文最大条数', nullable: true })
  timeout: number;

  @Column({ comment: '模型单次调用扣除的次数', default: 1 })
  deduct: number;

  /** Midjourney（drawingType=3）：慢速 RELAX 通道单次基准扣费；空则使用 deduct */
  @Column({ type: 'double', comment: 'MJ慢速(relax)单次扣除，空则同deduct', nullable: true })
  deductMjRelax: number | null;

  /** Midjourney：快速 FAST 通道单次基准扣费；空则使用 deduct */
  @Column({ type: 'double', comment: 'MJ快速(fast)单次扣除，空则同deduct', nullable: true })
  deductMjFast: number | null;

  /** Midjourney：极速 TURBO 通道单次基准扣费；空则使用 deduct */
  @Column({ type: 'double', comment: 'MJ极速(turbo)单次扣除，空则同deduct', nullable: true })
  deductMjTurbo: number | null;

  @Column({ comment: '模型开启深度思考后积分扣除的系数', default: 1 })
  deductDeepThink: number;

  @Column({ comment: '模型扣除余额类型 1: 普通模型 2: 高级模型', default: 1 })
  deductType: number;

  @Column({ comment: '是否使用token计费: 0:不是 1: 是', default: 0 })
  isTokenBased: boolean;

  @Column({
    comment:
      '文件解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:向量解析(内置文件分析,支持全模型分析带文字的文件)',
    default: 0,
  })
  isFileUpload: number;

  @Column({
    comment:
      '图片解析: 0:不使用 1:逆向格式(直接附带链接,仅支持逆向渠道) 2:GPT Vision 3:全局解析(支持所有格式的图片解析)',
    default: 0,
  })
  isImageUpload: number;

  @Column({ comment: 'token计费比例', default: 0 })
  tokenFeeRatio: number;

  /** 0: 按 tokenFeeRatio + 单次扣除(deduct) 旧算法；1: 按百万 token 外币单价折算积分 */
  @Column({ comment: 'Token计费策略 0比例 1百万token外币价', default: 0 })
  tokenBillingStrategy: number;

  /** 策略1下：每百万 token 价格的币种（USD 或 CNY） */
  @Column({ length: 8, comment: '百万token计价币别 USD|CNY', default: 'CNY' })
  tokenPriceCurrency: string;

  /** 策略1下：输入 token 每 1,000,000 tokens 的单价（单位：所选币种） */
  @Column({ type: 'double', comment: '输入每百万token单价(所选币别)', default: 0, nullable: true })
  tokenInputPricePerMillion: number | null;

  /** 策略1下：输出 token 每 1,000,000 tokens 的单价（单位：所选币种） */
  @Column({ type: 'double', comment: '输出每百万token单价(所选币别)', default: 0, nullable: true })
  tokenOutputPricePerMillion: number | null;

  /** 是否开启「仅展示」的 Token 用量金额估算（不参与扣费） */
  @Column({ type: 'boolean', comment: '是否开启token用量金额估算(仅展示)', default: false })
  estimateTokenCostEnabled: boolean;

  /** 估算用币别：USD 或 CNY */
  @Column({ length: 8, comment: '估算计价币别 USD|CNY', default: 'CNY' })
  estimateTokenCurrency: string;

  @Column({
    type: 'double',
    comment: '估算：输入每百万token单价(所选币别)',
    default: 0,
    nullable: true,
  })
  estimateTokenInputPerMillion: number | null;

  @Column({
    type: 'double',
    comment: '估算：输出每百万token单价(所选币别)',
    default: 0,
    nullable: true,
  })
  estimateTokenOutputPerMillion: number | null;

  @Column({ comment: '模型附加信息', nullable: true })
  remark: string;

  @Column({ comment: '模型的key', nullable: true })
  key: string;

  @Column({ comment: '使用的状态: 0:禁用 1：启用', default: 1 })
  status: boolean;

  @Column({ comment: 'key的使用次数', default: 0 })
  useCount: number;

  @Column({ comment: 'key的已经使用的token数量', default: 0 })
  useToken: number;

  @Column({ comment: '当前模型的代理地址', nullable: true })
  proxyUrl: string;

  @Column({ comment: '模型频率限制 次/小时', default: 999 })
  modelLimits: number;

  @Column({ comment: '模型介绍', nullable: true })
  modelDescription: string;

  @Column({ comment: '开启联网搜索', nullable: true, default: true })
  isNetworkSearch: boolean;

  @Column({ comment: '深度思考类型 0:关闭 1:全局思考 2:模型思考', nullable: true, default: 0 })
  deepThinkingType: number;

  @Column({ comment: '是否支持MCP工具', nullable: true, default: false })
  isMcpTool: boolean;

  @Column({ comment: '模型system预设', nullable: true })
  systemPrompt: string;

  @Column({
    comment: '预设类型 0:关闭预设 1: 附加模式 2: 覆盖模式',
    nullable: true,
    default: 0,
  })
  systemPromptType: number;

  @Column({
    comment:
      '绘画类型: 0:不是绘画 1:dalle兼容 2:gpt-image-1兼容 3:midjourney 4:chat正则提取 5:豆包',
    nullable: true,
    default: 0,
  })
  drawingType: number;
}
