import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryAdminSunoMusicJobsDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  page?: number;

  @ApiProperty({ example: 20, required: false })
  @IsOptional()
  size?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  userId?: number;

  @ApiProperty({ description: '标题 / clip_id 模糊', required: false })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  modelKey?: string;

  @ApiProperty({ description: '进行中 1/0', required: false })
  @IsOptional()
  @IsString()
  loading?: string;

  @ApiProperty({ description: 'clip_id 精确', required: false })
  @IsOptional()
  @IsString()
  clipId?: string;

  @ApiProperty({ description: '状态 submitted/complete/error', required: false })
  @IsOptional()
  @IsString()
  status?: string;
}
