import type { SunoModelVersion } from '@/types/music'
import { SUNO_DEFAULT_MODEL_VERSION } from '@/types/music'

/** 文档 doc/音乐/音乐版本以及生成参数介绍.md — 成曲/续写最长时长（秒） */
export interface SunoMvLimitSpec {
  mv: SunoModelVersion
  labelKey: string
  /** 官方成曲最长时长 */
  maxGenerationSec: number
  /**
   * 上传音频建议上限（秒）。
   * URL 上传文档写 <120s，但 ephone 实测可更长；此处取「成曲上限」与 URL 文档的实用折中。
   * 上传本身与 mv 无强绑定，续写/编辑时才严格依赖 mv。
   */
  deprecated?: boolean
}

export const SUNO_MV_LIMIT_SPECS: readonly SunoMvLimitSpec[] = [
  {
    mv: 'chirp-fenix',
    labelKey: 'music.mvFenix',
    maxGenerationSec: 480,
    recommendedUploadSec: 480,
  },
  {
    mv: 'chirp-crow',
    labelKey: 'music.mvCrow',
    maxGenerationSec: 480,
    recommendedUploadSec: 480,
  },
  {
    mv: 'chirp-bluejay',
    labelKey: 'music.mvBluejay',
    maxGenerationSec: 480,
    recommendedUploadSec: 480,
  },
  {
    mv: 'chirp-auk-turbo',
    labelKey: 'music.mvAukTurbo',
    maxGenerationSec: 240,
    recommendedUploadSec: 240,
  },
  {
    mv: 'chirp-auk',
    labelKey: 'music.mvAuk',
    maxGenerationSec: 240,
    recommendedUploadSec: 240,
  },
  {
    mv: 'chirp-v4',
    labelKey: 'music.mvV4',
    maxGenerationSec: 150,
    recommendedUploadSec: 150,
  },
] as const

/** 全站硬上限：后端 50MB + ephone URL 上传实测约 300s 稳定；留余量 */
export const SUNO_UPLOAD_HARD_MAX_SEC = 300

/** 文档 URL 上传建议（ephone /suno/uploads/audio-url） */
export const SUNO_UPLOAD_URL_DOC_MAX_SEC = 120

export function sunoMvLimitSpec(mv: SunoModelVersion | string | undefined): SunoMvLimitSpec {
  const found = SUNO_MV_LIMIT_SPECS.find(s => s.mv === mv)
  return found ?? SUNO_MV_LIMIT_SPECS.find(s => s.mv === SUNO_DEFAULT_MODEL_VERSION)!
}

export function recommendedUploadSecForMv(mv: SunoModelVersion | string | undefined): number {
  return sunoMvLimitSpec(mv).recommendedUploadSec
}

export type UploadDurationCheck =
  | { ok: true; warn?: string }
  | { ok: false; reason: 'hard_max' | 'mv_exceeds'; sec: number; limitSec: number }

/** 根据侧栏所选 mv 校验上传时长 */
export function checkUploadDurationForMv(
  durationSec: number,
  mv: SunoModelVersion | string | undefined
): UploadDurationCheck {
  const sec = Math.ceil(durationSec)
  if (sec > SUNO_UPLOAD_HARD_MAX_SEC) {
    return { ok: false, reason: 'hard_max', sec, limitSec: SUNO_UPLOAD_HARD_MAX_SEC }
  }
  const mvLimit = recommendedUploadSecForMv(mv)
  if (sec > mvLimit) {
    return { ok: false, reason: 'mv_exceeds', sec, limitSec: mvLimit }
  }
  if (sec > SUNO_UPLOAD_URL_DOC_MAX_SEC && sec <= mvLimit) {
    return {
      ok: true,
      warn: 'url_doc_exceed',
    }
  }
  return { ok: true }
}

export function formatUploadDurationLimitSec(mv: SunoModelVersion | string | undefined): number {
  return Math.min(recommendedUploadSecForMv(mv), SUNO_UPLOAD_HARD_MAX_SEC)
}
