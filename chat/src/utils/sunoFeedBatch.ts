import { sunoFeedAPI, sunoFetchBatchAPI } from '@/api/sunoMusic'
import type { MusicClipItem } from '@/types/music'
import { unwrapMusicApiData } from '@/utils/sunoApiUnwrap'
import { parseSunoFeedClips, type SunoFeedClip } from '@/utils/sunoFeedParse'

export interface PollClipEntry {
  localId: string
  clipId: string
  sceneLabel: string
  createdAt: number
}

function normalizeStatus(raw?: string): string {
  const s = String(raw || '').toLowerCase()
  if (s === 'complete' || s === 'completed' || s === 'success' || s === 'succeeded')
    return 'complete'
  if (s === 'error' || s === 'failed' || s === 'failure') return 'error'
  if (s === 'streaming' || s === 'processing' || s === 'in_progress' || s === 'running')
    return 'streaming'
  if (s === 'queued' || s === 'queue' || s === 'pending' || s === 'submitted') return 'queued'
  return 'streaming'
}

function clipRowsFromArray(arr: unknown[]): SunoFeedClip[] {
  const out: SunoFeedClip[] = []
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue
    const c = x as Record<string, unknown>
    const id = String(c.id ?? c.clip_id ?? '').trim()
    if (!id) continue
    const st = c.status != null ? String(c.status) : c.state != null ? String(c.state) : ''
    out.push({
      ...c,
      id,
      status: st ? normalizeStatus(st) : c.status,
    } as SunoFeedClip)
  }
  return out
}

/** 解析 POST /suno/fetch 批量响应为 feed clip 列表 */
export function parseBatchFetchToFeedClips(data: unknown): SunoFeedClip[] {
  const unwrapped = unwrapMusicApiData<unknown>(data)
  if (!unwrapped) return []
  const tasks = Array.isArray(unwrapped) ? unwrapped : [unwrapped]
  const out: SunoFeedClip[] = []
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue
    const t = task as Record<string, unknown>
    const fail = String(t.fail_reason ?? '').trim()
    const st = normalizeStatus(String(t.status ?? t.state ?? ''))
    if (st === 'error' || fail) continue

    const songs = t.songs ?? t.clips ?? t.items
    if (Array.isArray(songs)) {
      out.push(...clipRowsFromArray(songs))
      continue
    }
    const inner = t.data
    if (Array.isArray(inner)) {
      out.push(...clipRowsFromArray(inner))
      continue
    }
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const nested = inner as Record<string, unknown>
      if (Array.isArray(nested.data)) out.push(...clipRowsFromArray(nested.data))
      else if (Array.isArray(nested.clips)) out.push(...clipRowsFromArray(nested.clips))
      else if (Array.isArray(nested.songs)) out.push(...clipRowsFromArray(nested.songs))
    }
  }
  return out
}

function collectTaskIds(entries: PollClipEntry[], clipItems: MusicClipItem[]): string[] {
  const ids = new Set<string>()
  for (const ent of entries) {
    const row = clipItems.find(c => c.id === ent.localId)
    const tid = String(row?.taskId ?? '').trim()
    if (tid) ids.add(tid)
  }
  return [...ids]
}

/** 收集可用于 feed 查询的 clip id（含 poll 占位锚点） */
export function collectFeedQueryClipIds(
  entries: PollClipEntry[],
  clipItems: MusicClipItem[]
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (raw?: string) => {
    const id = String(raw ?? '').trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  for (const ent of entries) {
    const row = clipItems.find(c => c.id === ent.localId)
    push(row?.pollAnchorClipId)
    push(row?.clipId)
    push(ent.clipId)
  }

  return ids
}

async function fetchFeedByClipIds(model: string, clipIds: string[]): Promise<SunoFeedClip[]> {
  if (!clipIds.length) return []

  if (clipIds.length > 1) {
    try {
      const res = await sunoFeedAPI(model, clipIds.join(','), { silent: true })
      const clips = parseSunoFeedClips(unwrapMusicApiData(res))
      if (clips.length) return clips
    } catch {
      /* try individually */
    }
  }

  for (const id of clipIds) {
    try {
      const res = await sunoFeedAPI(model, id, { silent: true })
      const clips = parseSunoFeedClips(unwrapMusicApiData(res))
      if (clips.length) return clips
    } catch {
      /* next id */
    }
  }

  return []
}

/**
 * 轮询时优先用批量 fetch（有 task_id 时），否则按 doc 用 feed/{clipId} 查询。
 * ephone 双变体：必须用 generate 占位 clip_id 作锚点，单独查成品 id 会返回空。
 */
export async function fetchClipsForPoll(
  model: string,
  entries: PollClipEntry[],
  clipItems: MusicClipItem[]
): Promise<SunoFeedClip[]> {
  const taskIds = collectTaskIds(entries, clipItems)
  if (taskIds.length > 0) {
    try {
      const res = await sunoFetchBatchAPI(model, taskIds)
      const batchClips = parseBatchFetchToFeedClips(res)
      if (batchClips.length) return batchClips
    } catch {
      /* fallback to feed */
    }
  }

  return fetchFeedByClipIds(model, collectFeedQueryClipIds(entries, clipItems))
}
