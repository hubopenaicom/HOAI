import { ApiProperty } from '@nestjs/swagger';

export class SetTokenCatalogDto {
  @ApiProperty({ required: false })
  id?: number;

  @ApiProperty({ example: 'openai/gpt-4o', description: 'API 模型 ID' })
  modelId: string;

  @ApiProperty({ required: false })
  displayName?: string;

  @ApiProperty({ example: 128000 })
  maxModelTokens: number;

  @ApiProperty({ example: 16384 })
  max_tokens: number;

  /** manual | openrouter | litellm | merged — 手工保存时应传 manual */
  @ApiProperty({ example: 'manual', required: false })
  source?: string;

  @ApiProperty({ example: true, required: false })
  locked?: boolean;

  @ApiProperty({ required: false })
  remark?: string;
}
