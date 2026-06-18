import type { MusicClipItem } from '@/types/music'

/** 与后端 FileInterceptor limits 一致 */
export const SUNO_UPLOAD_MAX_FILE_BYTES = 50 * 1024 * 1024

export function isUploadSourceClip(clip?: MusicClipItem | null): boolean {
  return Boolean(clip?.isUploadClip)
}

/** 文档：Persona 根曲须为系统生成曲，非 uploader */
export function canCreatePersonaFromClip(clip?: MusicClipItem | null): boolean {
  if (!clip?.clipId?.trim()) return false
  return !isUploadSourceClip(clip)
}

export function canUsePersonaSing(clip?: MusicClipItem | null): boolean {
  return canCreatePersonaFromClip(clip)
}

export function formatUploadMaxFileMb(): number {
  return Math.round(SUNO_UPLOAD_MAX_FILE_BYTES / (1024 * 1024))
}
