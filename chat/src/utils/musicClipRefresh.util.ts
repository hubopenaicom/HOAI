import type { MusicClipItem } from '@/types/music'
import { isClipGenerationSettled, isClipPlaybackReady } from '@/utils/musicClipPlaybackReady'

/** 需要从上游 feed 补全媒体或状态的曲目 */
export function clipsNeedingFeedRefresh(clips: MusicClipItem[]): MusicClipItem[] {
  return clips.filter(c => {
    const id = c.clipId?.trim()
    if (!id) return false
    if (isClipPlaybackReady(c)) return false
    if (c.status === 'error') return false
    return true
  })
}

/** 同批双变体：第二槽 clipId 为空但仍未结束时，需借助同批锚点 clip 拉 feed */
export function dualVariantBatchGroups(clips: MusicClipItem[]): MusicClipItem[][] {
  const groups = new Map<string, MusicClipItem[]>()
  for (const c of clips) {
    if (!c.sceneLabel || !c.createdAt || c.parentClipId) continue
    const key = `${c.createdAt}:${c.sceneLabel}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  return [...groups.values()].filter(group => {
    if (group.length < 2) return false
    const hasAnchor = group.some(c => Boolean(c.clipId?.trim()))
    const hasPending = group.some(c => !c.clipId?.trim() || !isClipGenerationSettled(c))
    return hasAnchor && hasPending
  })
}
