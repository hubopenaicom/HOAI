import type { MusicClipItem, SunoTaskStatus } from '@/types/music'

export const SUNO_CDN_MP3_RE = /cdn\d*\.suno\.ai\/[^\s?]+\.mp3/i
export const SUNO_AUDIOPIPE_RE = /audiopipe\.suno\.ai/i

export function isCdnMp3Url(audioUrl?: string): boolean {
  return SUNO_CDN_MP3_RE.test(String(audioUrl ?? '').trim())
}

export function isAudiopipeUrl(audioUrl?: string): boolean {
  return SUNO_AUDIOPIPE_RE.test(String(audioUrl ?? '').trim())
}

export function hasPositiveDuration(duration?: number): boolean {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
}

/** Suno 已交付成品：CDN + 封面 + clipId（生成中通常不会三者齐备） */
export function isSunoDeliveredArtifact(
  clip: Pick<MusicClipItem, 'clipId' | 'audioUrl' | 'imageUrl'>
): boolean {
  const clipId = String(clip.clipId ?? '').trim()
  const image = String(clip.imageUrl ?? '').trim()
  if (!clipId || !image) return false
  return isCdnMp3Url(clip.audioUrl)
}

/**
 * 历史任务被误标 streaming / duration=0，但 CDN 与封面已存在且创建已久。
 * 避免「有音频地址仍显示生成中」（如不夜城第二变体）。
 */
export function isStaleSunoDeliveredClip(
  clip: Pick<MusicClipItem, 'clipId' | 'audioUrl' | 'imageUrl' | 'createdAt'>
): boolean {
  if (!isSunoDeliveredArtifact(clip)) return false
  const ageMs = Date.now() - (clip.createdAt || 0)
  return ageMs > 2 * 60 * 1000
}

/** 云端/本地已持久化为 complete 的历史曲目（如仅存 audiopipe、未写 duration） */
export function isPersistedLegacyComplete(
  clip: Pick<MusicClipItem, 'status' | 'clipId' | 'audioUrl'>
): boolean {
  if (clip.status !== 'complete') return false
  const clipId = String(clip.clipId ?? '').trim()
  const audio = String(clip.audioUrl ?? '').trim()
  if (!clipId || !audio) return false
  return isAudiopipeUrl(audio) || isCdnMp3Url(audio)
}

/** 成品可稳定播放 */
export function isClipPlaybackReady(
  clip: Pick<MusicClipItem, 'status' | 'clipId' | 'audioUrl' | 'duration'>
): boolean {
  const audio = String(clip.audioUrl ?? '').trim()
  if (!audio) return false

  if (isCdnMp3Url(audio) && hasPositiveDuration(clip.duration)) return true

  if (isAudiopipeUrl(audio) && hasPositiveDuration(clip.duration)) return true

  if (isPersistedLegacyComplete(clip)) return true

  if (isStaleSunoDeliveredClip(clip)) return true

  return false
}

/** 生成中可试听：audiopipe 流式地址且尚未持久化为完成 */
export function isClipStreamPreview(clip: Pick<MusicClipItem, 'status' | 'audioUrl'>): boolean {
  return isAudiopipeUrl(clip.audioUrl) && clip.status !== 'complete'
}

/**
 * 根据媒体事实校正状态。
 * - 进行中：audiopipe 或无时长 CDN → streaming
 * - 历史已完成：DB 标记 complete + audiopipe/CDN → 保持 complete
 */
export function reconcileClipStatusFromMedia(row: MusicClipItem): MusicClipItem {
  if (row.status === 'error') return row

  if (isClipPlaybackReady(row)) {
    return { ...row, status: 'complete' }
  }

  const audio = String(row.audioUrl ?? '').trim()

  if (isAudiopipeUrl(audio)) {
    if (hasPositiveDuration(row.duration) || isPersistedLegacyComplete(row)) {
      return { ...row, status: 'complete' }
    }
    return { ...row, status: 'streaming' }
  }

  if (isCdnMp3Url(audio) && !hasPositiveDuration(row.duration)) {
    if (isPersistedLegacyComplete(row) || isStaleSunoDeliveredClip(row)) {
      return { ...row, status: 'complete' }
    }
    return { ...row, status: 'streaming' }
  }

  if (hasPositiveDuration(row.duration) && audio) {
    return { ...row, status: 'complete' }
  }

  return row
}

/** 轮询/恢复：未达可播放且非 error 则继续 */
export function isClipGenerationSettled(
  clip: Pick<MusicClipItem, 'status' | 'clipId' | 'audioUrl' | 'duration'>
): boolean {
  if (clip.status === 'error') return true
  if (isClipPlaybackReady(clip)) return true
  if (clip.status === 'streaming' || clip.status === 'queued' || clip.status === 'submitted') {
    return false
  }
  return false
}

export function isClipPlayable(
  clip: Pick<MusicClipItem, 'status' | 'clipId' | 'audioUrl' | 'duration'>
): boolean {
  return isClipPlaybackReady(clip)
}

/** UI 列表：生成中（含 streaming / 无时长 CDN） */
export function isClipGenerating(
  clip: Pick<MusicClipItem, 'status' | 'clipId' | 'audioUrl' | 'duration'>
): boolean {
  if (clip.status === 'error') return false
  return !isClipPlaybackReady(clip)
}

export function displayStatusForClip(clip: MusicClipItem): SunoTaskStatus {
  return reconcileClipStatusFromMedia(clip).status
}
