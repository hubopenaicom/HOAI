import type { MusicClipItem } from '@/types/music'
import type { SunoFeedClip } from '@/utils/sunoFeedParse'

/** 从 feed / 本地 clip 提取后续编辑所需的上下文 */
export interface SunoClipContext {
  clipId: string
  taskId?: string
  duration?: number
  isUpload?: boolean
  tags?: string
}

function metaRecord(
  clip: SunoFeedClip | Record<string, unknown>
): Record<string, unknown> | undefined {
  const meta = (clip as SunoFeedClip).metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta))
    return meta as Record<string, unknown>
  return undefined
}

function pickTaskId(clip: SunoFeedClip | Record<string, unknown>): string | undefined {
  const o = clip as Record<string, unknown>
  const direct = String(o.task_id ?? o.taskId ?? '').trim()
  if (direct) return direct
  const meta = metaRecord(clip)
  if (!meta) return undefined
  const fromMeta = String(meta.task_id ?? meta.taskId ?? '').trim()
  return fromMeta || undefined
}

function pickDuration(clip: SunoFeedClip | Record<string, unknown>): number | undefined {
  const o = clip as Record<string, unknown>
  if (typeof o.duration === 'number' && Number.isFinite(o.duration)) return o.duration
  const meta = metaRecord(clip)
  if (meta && typeof meta.duration === 'number' && Number.isFinite(meta.duration)) {
    return meta.duration as number
  }
  return undefined
}

function pickIsUpload(clip: SunoFeedClip | Record<string, unknown>): boolean {
  const meta = metaRecord(clip)
  if (!meta) return false
  const type = String(meta.type ?? meta.clip_type ?? meta.source ?? '').toLowerCase()
  if (/upload|user_upload|uploaded/.test(type)) return true
  if (meta.is_upload === true || meta.upload === true) return true
  return false
}

/** 从 feed clip 解析上下文 */
export function clipContextFromFeed(clip: SunoFeedClip): SunoClipContext {
  const clipId = String(clip.id ?? (clip as Record<string, unknown>).clip_id ?? '').trim()
  return {
    clipId,
    taskId: pickTaskId(clip),
    duration: pickDuration(clip),
    isUpload: pickIsUpload(clip),
    tags: clip.tags != null ? String(clip.tags) : undefined,
  }
}

/** 从本地 MusicClipItem 解析上下文（用于提交前合并） */
export function clipContextFromItem(item: MusicClipItem): SunoClipContext {
  return {
    clipId: item.clipId,
    taskId: item.taskId,
    duration: item.duration,
    isUpload: item.isUploadClip,
    tags: item.tags,
  }
}

/** 合并表单 target 与列表中的 clip 上下文 */
export function resolveClipContext(
  targetClipId: string,
  clips: MusicClipItem[],
  overrides?: Partial<SunoClipContext>
): SunoClipContext | undefined {
  const id = targetClipId.trim()
  if (!id) return undefined
  const found = clips.find(c => c.clipId === id)
  const base = found ? clipContextFromItem(found) : { clipId: id }
  return { ...base, ...overrides, clipId: id }
}

/** 将 feed 解析结果合并进 MusicClipItem 补丁 */
export function mergeClipContextFromFeed(
  item: MusicClipItem,
  clip: SunoFeedClip
): Partial<MusicClipItem> {
  const ctx = clipContextFromFeed(clip)
  const patch: Partial<MusicClipItem> = {}
  if (ctx.taskId) patch.taskId = ctx.taskId
  if (ctx.duration != null) patch.duration = ctx.duration
  if (ctx.isUpload) patch.isUploadClip = true
  if (ctx.tags && !item.tags) patch.tags = ctx.tags
  return patch
}
