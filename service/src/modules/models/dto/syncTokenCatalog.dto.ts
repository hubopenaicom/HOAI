import { ApiProperty } from '@nestjs/swagger';

export class SyncTokenCatalogDto {
  /** openrouter | litellm | both */
  @ApiProperty({ example: 'both', required: false })
  scope?: string;

  /** true：包含锁定行也覆盖更新 */
  @ApiProperty({ example: false, required: false })
  force?: boolean;
}
