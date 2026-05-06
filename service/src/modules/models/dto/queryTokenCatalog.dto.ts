import { ApiProperty } from '@nestjs/swagger';

export class QueryTokenCatalogDto {
  @ApiProperty({ example: 1, required: false })
  page?: number;

  @ApiProperty({ example: 10, required: false })
  size?: number;

  @ApiProperty({ example: 'gpt', required: false, description: 'modelId 模糊搜索' })
  modelId?: string;

  @ApiProperty({ example: 'manual', required: false, description: '来源筛选' })
  source?: string;
}
