import { ApiProperty } from '@nestjs/swagger';

export class SetModelDto {
  @ApiProperty({ example: 1, description: 'key id', required: false })
  id: number;

  @ApiProperty({ example: 1, description: '模型类型', required: true })
  keyType: number;

  @ApiProperty({ example: '默认', description: '模型中文名称', required: true })
  modelName: string;

  @ApiProperty({ example: 'sk-', description: '模型key', required: false })
  key: any;

  @ApiProperty({
    example: true,
    description: '是否开启当前key对应的模型',
    required: true,
  })
  status: boolean;

  @ApiProperty({
    example: 'gpt-3.5',
    description: '当前key绑定的模型是多少 需要调用的模型',
    required: true,
  })
  model: string;

  @ApiProperty({ example: 1, description: '模型排序' })
  modelOrder: number;

  @ApiProperty({ example: 'https://***.png', required: false })
  modelAvatar: string;

  @ApiProperty({
    example: 4096,
    description: '模型支持的最大TOken数量',
    required: false,
  })
  maxModelTokens: number;

  @ApiProperty({
    example: true,
    description: '模型的代理地址',
    required: false,
  })
  proxyUrl: string;

  @ApiProperty({ example: 300, description: '模型超时时间', required: false })
  timeout: number;

  @ApiProperty({ example: true, description: 'key状态', required: false })
  keyStatus: number;

  @ApiProperty({
    example: true,
    description: '扣费类型 1： 普通 2： 高级余额',
    required: false,
  })
  deductType: number;

  @ApiProperty({ example: true, description: '单次扣除金额', required: false })
  deduct: number;

  @ApiProperty({ example: 1, description: 'MJ慢速(relax)单次扣除，空则同deduct', required: false })
  deductMjRelax?: number | null;

  @ApiProperty({ example: 1, description: 'MJ快速(fast)单次扣除，空则同deduct', required: false })
  deductMjFast?: number | null;

  @ApiProperty({ example: 1, description: 'MJ极速(turbo)单次扣除，空则同deduct', required: false })
  deductMjTurbo?: number | null;

  @ApiProperty({
    example: true,
    description: '最大上下文轮次',
    required: false,
  })
  maxRounds: number;

  @ApiProperty({
    example: true,
    description: '是否设置为绘画Key',
    required: false,
  })
  isDraw: boolean;

  @ApiProperty({
    example: true,
    description: '是否支持文件上传',
    required: false,
  })
  isFileUpload: number;

  @ApiProperty({
    example: true,
    description: '是否使用token计费',
    required: false,
  })
  isTokenBased: boolean;

  @ApiProperty({ example: true, description: 'token计费比例', required: false })
  tokenFeeRatio: number;

  @ApiProperty({ example: 0, description: 'Token计费策略 0比例 1百万token外币价', required: false })
  tokenBillingStrategy?: number;

  @ApiProperty({ example: 'CNY', description: '百万token计价币别 USD|CNY', required: false })
  tokenPriceCurrency?: string;

  @ApiProperty({ example: 0, description: '输入每百万token单价(所选币别)', required: false })
  tokenInputPricePerMillion?: number;

  @ApiProperty({ example: 0, description: '输出每百万token单价(所选币别)', required: false })
  tokenOutputPricePerMillion?: number;

  @ApiProperty({
    example: false,
    description: '是否开启token用量金额估算(仅展示)',
    required: false,
  })
  estimateTokenCostEnabled?: boolean;

  @ApiProperty({ example: 'CNY', description: '估算计价币别 USD|CNY', required: false })
  estimateTokenCurrency?: string;

  @ApiProperty({ example: 0, description: '估算：输入每百万token单价', required: false })
  estimateTokenInputPerMillion?: number;

  @ApiProperty({ example: 0, description: '估算：输出每百万token单价', required: false })
  estimateTokenOutputPerMillion?: number;
}
