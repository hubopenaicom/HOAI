import { Global, Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelsEntity } from './models.entity';
import { ModelTokenCatalogEntity } from './model-token-catalog.entity';
import { ModelTokenCatalogService } from './model-token-catalog.service';
// import { ModelsTypeEntity } from './modelType.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ModelsEntity, ModelTokenCatalogEntity])],
  controllers: [ModelsController],
  providers: [ModelsService, ModelTokenCatalogService],
  exports: [ModelsService, ModelTokenCatalogService],
})
export class ModelsModule {}
