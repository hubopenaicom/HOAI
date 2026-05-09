import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryModelDto } from './dto/queryModel.dto';
import { QueryModelTypeDto } from './dto/queryModelType.dto';
import { QueryTokenCatalogDto } from './dto/queryTokenCatalog.dto';
import { SetModelDto } from './dto/setModel.dto';
import { SetModelTypeDto } from './dto/setModelType.dto';
import { SetTokenCatalogDto } from './dto/setTokenCatalog.dto';
import { SyncTokenCatalogDto } from './dto/syncTokenCatalog.dto';
import { ModelTokenCatalogService } from './model-token-catalog.service';
import { ModelsService } from './models.service';

@ApiTags('models')
@Controller('models')
export class ModelsController {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly modelTokenCatalogService: ModelTokenCatalogService,
  ) {}

  @Post('setModel')
  @ApiOperation({ summary: '设置模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModel(@Body() params: SetModelDto) {
    return this.modelsService.setModel(params);
  }

  @Post('delModel')
  @ApiOperation({ summary: '删除模型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModel(@Body() params: { id: number }) {
    return this.modelsService.delModel(params);
  }

  @Get('query')
  @ApiOperation({ summary: '管理端查询模型列表' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  queryModels(@Req() req: Request, @Query() params: QueryModelDto) {
    return this.modelsService.queryModels(req, params);
  }

  @Get('list')
  @ApiOperation({ summary: '客户端查询当前所有可以使用的模型' })
  modelsList() {
    return this.modelsService.modelsList();
  }

  @Get('drawingList')
  @ApiOperation({ summary: '客户端查询绘画独立页可用模型（后台配置 drawingType>0）' })
  drawingModelsList() {
    return this.modelsService.drawingModelsList();
  }

  @Get('baseConfig')
  @ApiOperation({ summary: '客户端查询当前已经配置模型的基础配置' })
  baseConfig() {
    return this.modelsService.getBaseConfig();
  }

  @Get('queryModelType')
  @ApiOperation({ summary: '查询模型类型' })
  queryModelType(@Query() params: QueryModelTypeDto) {
    return this.modelsService.queryModelType(params);
  }

  @Post('setModelType')
  @ApiOperation({ summary: '创建修改模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setModelType(@Body() params: SetModelTypeDto) {
    return this.modelsService.setModelType(params);
  }

  @Post('delModelType')
  @ApiOperation({ summary: '删除模型类型' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delModelType(@Body() params: { id: number }) {
    return this.modelsService.delModelType(params);
  }

  /** 单段路径，与 query 一致，避免部分反向代理对 models/tokenCatalog/query 类嵌套路径处理异常 */
  @Get('queryTokenCatalog')
  @ApiOperation({ summary: '模型 Token 维护表分页查询' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  queryTokenCatalog(@Query() params: QueryTokenCatalogDto) {
    return this.modelTokenCatalogService.query(params);
  }

  @Post('setTokenCatalog')
  @ApiOperation({ summary: '新增/更新模型 Token 维护项' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  setTokenCatalog(@Body() body: SetTokenCatalogDto) {
    return this.modelTokenCatalogService.set(body);
  }

  @Post('delTokenCatalog')
  @ApiOperation({ summary: '删除模型 Token 维护项' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  delTokenCatalog(@Body() body: { id: number }) {
    return this.modelTokenCatalogService.delete(body.id);
  }

  @Post('syncTokenCatalog')
  @ApiOperation({ summary: '启动异步同步（返回 syncId，轮询 syncTokenCatalogProgress）' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  syncTokenCatalog(@Body() body: SyncTokenCatalogDto) {
    return this.modelTokenCatalogService.startSyncJob(body || {});
  }

  @Get('syncTokenCatalogProgress')
  @ApiOperation({ summary: '查询同步任务进度' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  syncTokenCatalogProgress(@Query('syncId') syncId: string) {
    return this.modelTokenCatalogService.getSyncProgress(syncId);
  }

  @Get('lookupTokenCatalog')
  @ApiOperation({ summary: '按模型 ID 查询建议的上下文/回复 Tokens（先表后公开源）' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  lookupTokenCatalog(@Query('modelId') modelId: string) {
    return this.modelTokenCatalogService.lookup(modelId);
  }
}
