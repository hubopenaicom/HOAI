import type { MusicClipItem } from '@/types/music'
import { dualVariantBatchGroups } from '@/utils/musicClipRefresh.util'
import { isClipPlaybackReady, reconcileClipStatusFromMedia } from '@/utils/musicClipPlaybackReady'
import { normalizeSunoPlaybackUrls } from '@/utils/sunoPlaybackUrl'

/** @deprecated 使用 reconcileClipStatusFromMedia */
export function promoteClipStatusFromMedia(row: MusicClipItem): MusicClipItem {
  return reconcileClipStatusFromMedia(row)
}

/**
 * 双变体：仅当兄弟轨已可播放且本轨有时长/可升级时，才提升状态。
 */
export function reconcileStaleDualVariants(clips: MusicClipItem[]): MusicClipItem[] {
  const byId = new Map(clips.map(c => [c.id, { ...c }]))

  for (const group of dualVariantBatchGroups([...byId.values()])) {
    const done = group.filter(c => isClipPlaybackReady(c))
    if (!done.length) continue

    for (const c of group) {
      if (c.status === 'error' || isClipPlaybackReady(c)) continue
      const row = byId.get(c.id)!
      const reconciled = reconcileClipStatusFromMedia(row)
      byId.set(c.id, reconciled)
    }
  }

  return [...byId.values()]
}

export function reconcileAllClipStatuses(clips: MusicClipItem[]): MusicClipItem[] {
  const promoted = clips.map(reconcileClipStatusFromMedia)
  return normalizeSunoPlaybackUrls(reconcileStaleDualVariants(promoted))
}
