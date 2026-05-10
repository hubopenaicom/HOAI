import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryAdminDrawingMjJobsDto {
  @ApiProperty({ example: 1, description: '页码', required: false })
  @IsOptional()
  page?: number;

  @ApiProperty({ example: 20, description: '每页条数', required: false })
  @IsOptional()
  size?: number;

  @ApiProperty({ example: 1, description: '用户 ID', required: false })
  @IsOptional()
  userId?: number;

  @ApiProperty({ description: '提示词 / 任务 ID 模糊搜索', required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ description: '模型 key 精确筛选', required: false })
  @IsOptional()
  @IsString()
  modelKey?: string;

  @ApiProperty({ description: '进行中 true / 已完成 false，不传则不限', required: false })
  @IsOptional()
  @IsString()
  loading?: string;

  @ApiProperty({ description: '上游任务 ID 精确筛选', required: false })
  @IsOptional()
  @IsString()
  taskId?: string;
}
