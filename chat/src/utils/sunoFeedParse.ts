import type { MusicClipItem, SunoTaskStatus } from '@/types/music'
import { mergeClipContextFromFeed } from '@/utils/sunoClipContext'
import { mergeClipProvenanceFromFeed } from '@/utils/musicClipProvenance'
import { normalizeSunoPlaybackUrl } from '@/utils/sunoPlaybackUrl'

export const SUNO_POLL_INTERVAL_MS = 4000
export const SUNO_POLL_MAX_ITERATIONS = 90

export interface SunoFeedClip {
  id?: string
  status?: string
  title?: string
  tags?: string
  audio_url?: string
  video_url?: string
  image_url?: string
  image_large_url?: string
  duration?: number
  error_message?: string
  [key: string]: unknown
}

export function normalizeSunoClipStatus(raw?: string): SunoTaskStatus {
  const s = String(raw || '').toLowerCase()
  if (s === 'complete' || s === 'completed' || s === 'success' || s === 'succeeded')
    return 'complete'
  if (s === 'error' || s === 'failed' || s === 'failure') return 'error'
  if (
    s === 'streaming' ||
    s === 'processing' ||
    s === 'in_progress' ||
    s === 'running' ||
    s === 'pending'
  )
    return 'streaming'
  if (s === 'queued' || s === 'queue' || s === 'submitted') return 'queued'
  return 'submitted'
}

function resolveClipStatus(clip: SunoFeedClip): SunoTaskStatus {
  const raw =
    clip.status != null && String(clip.status).trim()
      ? String(clip.status)
      : clip.state != null
        ? String(clip.state)
        : ''
  const normalized = normalizeSunoClipStatus(raw)
  if (normalized === 'error') return normalized

  const audio = String(clip.audio_url ?? '').trim()
  if (/audiopipe\.suno\.ai/i.test(audio)) {
    if (typeof clip.duration === 'number' && clip.duration > 0) return 'complete'
    return 'streaming'
  }

  if (/cdn\d*\.suno\.ai\/.*\.mp3/i.test(audio)) {
    if (typeof clip.duration === 'number' && clip.duration > 0) return 'complete'
    return 'streaming'
  }

  const state = String(clip.state ?? '').toLowerCase()
  if (state === 'succeeded' || state === 'success') {
    if (typeof clip.duration === 'number' && clip.duration > 0) return 'complete'
    if (audio) return 'streaming'
  }

  if (normalized === 'complete') {
    if (typeof clip.duration === 'number' && clip.duration > 0) return 'complete'
    if (audio) return 'streaming'
    return normalized
  }

  if (audio && typeof clip.duration === 'number' && clip.duration > 0) return 'complete'

  return normalized
}

function normalizeFeedClipRow(clip: SunoFeedClip): SunoFeedClip {
  const status = resolveClipStatus(clip)
  return { ...clip, status }
}

function unwrapSunoBody(data: unknown): unknown {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return data
  const o = data as Record<string, unknown>
  const code = String(o.code ?? '').toLowerCase()
  if ((code === 'success' || code === 'ok') && o.data !== undefined) return o.data
  return data
}

function isLikelySunoClipId(value: string): boolean {
  const t = value.trim()
  if (!t || t.length > 80 || /\s/.test(t) || t.includes('<')) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t))
    return true
  return t.length >= 8 && t.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(t)
}

function clipFromItem(item: unknown): { id: string; status: SunoTaskStatus } | null {
  if (!item || typeof item !== 'object') return null
  const c = item as Record<string, unknown>
  const id = String(c.id ?? c.clip_id ?? '').trim()
  if (!id) return null
  const status = normalizeSunoClipStatus(String(c.status ?? (c.state != null ? c.state : '')))
  return { id, status }
}

/** 解析 generate / concat 响应中的 clips（兼容聚合网关 { code, data } 与 concat 返回 task_id 字符串） */
export function parseSunoGenerateClips(data: unknown): { id: string; status: SunoTaskStatus }[] {
  const unwrapped = unwrapSunoBody(data)
  if (typeof unwrapped === 'string' && isLikelySunoClipId(unwrapped)) {
    return [{ id: unwrapped.trim(), status: 'submitted' }]
  }
  if (!unwrapped || typeof unwrapped !== 'object') return []
  if (Array.isArray(unwrapped)) {
    return unwrapped.map(clipFromItem).filter(Boolean) as { id: string; status: SunoTaskStatus }[]
  }
  const o = unwrapped as Record<string, unknown>
  const raw = o.clips ?? o.clip_list ?? o.items
  if (Array.isArray(raw)) {
    return raw.map(clipFromItem).filter(Boolean) as { id: string; status: SunoTaskStatus }[]
  }
  const single = clipFromItem(o)
  return single ? [single] : []
}

function normalizeFeedClipArray(arr: SunoFeedClip[]): SunoFeedClip[] {
  return arr.map(normalizeFeedClipRow)
}

/** 解析 feed / fetch 响应为 clip 数组 */
export function parseSunoFeedClips(data: unknown): SunoFeedClip[] {
  const unwrapped = unwrapSunoBody(data)
  if (Array.isArray(unwrapped)) return normalizeFeedClipArray(unwrapped as SunoFeedClip[])
  if (!unwrapped || typeof unwrapped !== 'object') return []
  const o = unwrapped as Record<string, unknown>
  if (Array.isArray(o.clips)) return normalizeFeedClipArray(o.clips as SunoFeedClip[])
  if (Array.isArray(o.songs)) return normalizeFeedClipArray(o.songs as SunoFeedClip[])
  if (Array.isArray(o.data)) {
    const inner = o.data
    if (Array.isArray(inner)) return normalizeFeedClipArray(inner as SunoFeedClip[])
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const nested = inner as Record<string, unknown>
      if (Array.isArray(nested.data)) return normalizeFeedClipArray(nested.data as SunoFeedClip[])
      if (Array.isArray(nested.clips)) return normalizeFeedClipArray(nested.clips as SunoFeedClip[])
    }
  }
  return []
}

function lyricsFromFeedClip(clip: SunoFeedClip): string | undefined {
  const meta = clip.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const p = (meta as Record<string, unknown>).prompt
    if (p != null && String(p).trim()) return String(p).trim()
  }
  if (clip.prompt != null && String(clip.prompt).trim()) return String(clip.prompt).trim()
  return undefined
}

export function feedClipToMusicItem(
  clip: SunoFeedClip,
  meta: { localId: string; sceneLabel?: string; createdAt: number; lyricsText?: string }
): MusicClipItem {
  const clipId = String(clip.id ?? '').trim()
  const status = resolveClipStatus(clip)
  const base: MusicClipItem = {
    id: meta.localId,
    clipId,
    title: String(clip.title || '').trim() || clipId.slice(0, 8),
    tags: clip.tags != null ? String(clip.tags) : undefined,
    status,
    audioUrl: clip.audio_url ? String(clip.audio_url) : undefined,
    imageUrl: clip.image_url
      ? String(clip.image_url)
      : clip.image_large_url
        ? String(clip.image_large_url)
        : undefined,
    duration: typeof clip.duration === 'number' && clip.duration > 0 ? clip.duration : undefined,
    lyricsText: meta.lyricsText ?? lyricsFromFeedClip(clip),
    sceneLabel: meta.sceneLabel,
    createdAt: meta.createdAt,
  }
  return normalizeSunoPlaybackUrl({
    ...base,
    ...mergeClipContextFromFeed(base, clip),
    ...mergeClipProvenanceFromFeed(clip),
  })
}

export function isSunoTerminalStatus(s: SunoTaskStatus) {
  return s === 'complete' || s === 'error'
}

/** 从 feed clip 提取上游失败原因（上传曲库拒绝、生成失败等） */
export function extractFeedClipErrorMessage(clip: SunoFeedClip): string {
  const direct = String(clip.error_message ?? '').trim()
  if (direct) return direct
  const meta = clip.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>
    const em = String(m.error_message ?? m.errorMessage ?? '').trim()
    if (em) return em
    const et = String(m.error_type ?? m.errorType ?? '').trim()
    if (et) return et
  }
  return ''
}

export function feedClipHasFailed(clip: SunoFeedClip): boolean {
  const status = resolveClipStatus(clip)
  if (status === 'error') return true
  return Boolean(extractFeedClipErrorMessage(clip))
}
