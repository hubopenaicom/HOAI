import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelsEntity } from '../models/models.entity';
import { UserEntity } from '../user/user.entity';
import { SunoMusicAdminController } from './suno-music-admin.controller';
import { SunoMusicController } from './suno-music.controller';
import { SunoMusicJobEntity } from './suno-music-job.entity';
import { SunoMusicJobService } from './suno-music-job.service';
import { SunoMusicService } from './suno-music.service';
import { SunoUploadService } from './suno-upload.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModelsEntity, SunoMusicJobEntity, UserEntity])],
  controllers: [SunoMusicController, SunoMusicAdminController],
  providers: [SunoMusicService, SunoMusicJobService, SunoUploadService],
  exports: [SunoMusicService],
})
export class SunoMusicModule {}
