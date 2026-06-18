import type { MusicClipItem, SunoTaskStatus } from '@/types/music'

function statusRank(s: SunoTaskStatus): number {
  if (s === 'complete') return 5
  if (s === 'streaming') return 4
  if (s === 'queued') return 3
  if (s === 'submitted') return 2
  if (s === 'error') return 1
  return 0
}

function mergeClipRow(a: MusicClipItem, b: MusicClipItem): MusicClipItem {
  const primary = statusRank(a.status) >= statusRank(b.status) ? a : b
  const secondary = primary === a ? b : a
  return {
    ...secondary,
    ...primary,
    id: primary.id || secondary.id,
    clipId: primary.clipId || secondary.clipId,
    title: primary.title || secondary.title,
    audioUrl: primary.audioUrl || secondary.audioUrl,
    imageUrl: primary.imageUrl || secondary.imageUrl,
    lyricsText: primary.lyricsText || secondary.lyricsText,
    tags: primary.tags || secondary.tags,
    duration: primary.duration ?? secondary.duration,
    taskId: primary.taskId || secondary.taskId,
    pollAnchorClipId: primary.pollAnchorClipId || secondary.pollAnchorClipId,
    serverJobId: primary.serverJobId ?? secondary.serverJobId,
    sceneLabel: primary.sceneLabel || secondary.sceneLabel,
    createdAt: Math.max(primary.createdAt || 0, secondary.createdAt || 0),
  }
}

/**
 * 合并多份任务列表：
 * - 优先按本地 id（clientKey）去重，避免双变体占位 clipId 冲突
 * - 同一 clipId 的云端/本地行合并为一条
 */
export function mergeMusicClipLists(...lists: MusicClipItem[][]): MusicClipItem[] {
  const byId = new Map<string, MusicClipItem>()
  const clipIdToLocalId = new Map<string, string>()

  const attach = (row: MusicClipItem) => {
    const localId = String(row.id || '').trim()
    const clipId = String(row.clipId || '').trim()

    if (clipId && clipIdToLocalId.has(clipId) && localId && !byId.has(localId)) {
      const targetId = clipIdToLocalId.get(clipId)!
      byId.set(targetId, mergeClipRow(byId.get(targetId)!, row))
      return
    }

    if (localId) {
      const prev = byId.get(localId)
      const merged = prev ? mergeClipRow(prev, row) : { ...row }
      byId.set(localId, merged)
      const cid = String(merged.clipId || '').trim()
      if (cid) clipIdToLocalId.set(cid, localId)
      return
    }

    if (clipId) {
      const linked = clipIdToLocalId.get(clipId)
      if (linked) {
        byId.set(linked, mergeClipRow(byId.get(linked)!, row))
        return
      }
      const fallbackId = `clip-${clipId.slice(0, 8)}`
      const prev = byId.get(fallbackId)
      const merged = prev ? mergeClipRow(prev, row) : { ...row, id: fallbackId }
      byId.set(fallbackId, merged)
      clipIdToLocalId.set(clipId, fallbackId)
    }
  }

  for (const list of lists) {
    for (const c of list) attach(c)
  }

  return [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}
