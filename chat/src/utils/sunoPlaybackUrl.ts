import type { MusicClipItem } from '@/types/music'
import {
  hasPositiveDuration,
  isAudiopipeUrl,
  isCdnMp3Url,
  reconcileClipStatusFromMedia,
} from '@/utils/musicClipPlaybackReady'

const SUNO_CDN_MP3_RE = /cdn\d*\.suno\.ai\/[^\s?]+\.mp3/i
const SUNO_AUDIOPIPE_RE = /audiopipe\.suno\.ai/i
const SUNO_ITEM_ID_RE = /item_id=([0-9a-f-]{36})/i

/** Suno 成品 MP3 固定 CDN 规则（doc/音乐 与线上 feed 一致） */
export function sunoCanonicalCdnMp3Url(clipId: string): string {
  const id = String(clipId ?? '').trim()
  return id ? `https://cdn1.suno.ai/${id}.mp3` : ''
}

export function extractClipIdFromAudiopipeUrl(audioUrl?: string): string {
  const audio = String(audioUrl ?? '').trim()
  if (!audio) return ''
  const m = audio.match(SUNO_ITEM_ID_RE)
  return m ? m[1] : ''
}

export function resolvePlaybackClipId(row: Pick<MusicClipItem, 'clipId' | 'audioUrl'>): string {
  const cid = String(row.clipId ?? '').trim()
  if (cid) return cid
  return extractClipIdFromAudiopipeUrl(row.audioUrl)
}

/**
 * 将 audiopipe 升级为 CDN MP3（仅当已有时长，说明上游成品已就绪）。
 * 生成中保留 audiopipe，避免构造尚未可用的 CDN 并误标完成。
 */
export function normalizeSunoPlaybackUrl(row: MusicClipItem): MusicClipItem {
  const clipId = resolvePlaybackClipId(row)
  if (!clipId) return reconcileClipStatusFromMedia(row)

  const withClipId = row.clipId?.trim() ? row : { ...row, clipId }

  const audio = String(withClipId.audioUrl ?? '').trim()
  if (audio && SUNO_CDN_MP3_RE.test(audio)) {
    return reconcileClipStatusFromMedia(withClipId)
  }

  if (
    isAudiopipeUrl(audio) &&
    (hasPositiveDuration(withClipId.duration) || withClipId.status === 'complete')
  ) {
    return reconcileClipStatusFromMedia({
      ...withClipId,
      clipId: withClipId.clipId?.trim() || clipId,
      audioUrl: sunoCanonicalCdnMp3Url(clipId),
    })
  }

  return reconcileClipStatusFromMedia(withClipId)
}

export function normalizeSunoPlaybackUrls(clips: MusicClipItem[]): MusicClipItem[] {
  return clips.map(normalizeSunoPlaybackUrl)
}

export { isAudiopipeUrl, isCdnMp3Url }
