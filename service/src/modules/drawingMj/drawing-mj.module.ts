import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelsEntity } from '../models/models.entity';
import { UserEntity } from '../user/user.entity';
import { DrawingMjAdminController } from './drawing-mj-admin.controller';
import { DrawingMjController } from './drawing-mj.controller';
import { DrawingMjJobEntity } from './drawing-mj-job.entity';
import { DrawingMjJobService } from './drawing-mj-job.service';
import { DrawingMjService } from './drawing-mj.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModelsEntity, DrawingMjJobEntity, UserEntity])],
  controllers: [DrawingMjController, DrawingMjAdminController],
  providers: [DrawingMjService, DrawingMjJobService],
  exports: [DrawingMjService],
})
export class DrawingMjModule {}
