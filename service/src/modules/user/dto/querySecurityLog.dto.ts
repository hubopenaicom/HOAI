import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 管理端查询用户安全审计日志（Query 参数多为字符串，在 Service 内再转 number） */
export class QuerySecurityLogDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 15 })
  @IsOptional()
  size?: number;

  @ApiPropertyOptional({ description: '用户 ID' })
  @IsOptional()
  userId?: number;

  @ApiPropertyOptional({ description: '动作，如 EMAIL_BIND、EMAIL_REBIND' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;
}
