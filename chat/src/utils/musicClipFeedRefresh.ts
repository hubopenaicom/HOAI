import type { MusicClipItem } from '@/types/music'
import { dualVariantBatchGroups } from '@/utils/musicClipRefresh.util'
import { reconcileAllClipStatuses } from '@/utils/musicClipStatus.util'
import { applyFeedToPollGroup } from '@/utils/sunoPollGroup'
import { fetchClipsForPoll, type PollClipEntry } from '@/utils/sunoFeedBatch'
import { isClipGenerationSettled } from '@/utils/musicClipPlaybackReady'
import { feedClipToMusicItem, type SunoFeedClip } from '@/utils/sunoFeedParse'

export { clipsNeedingFeedRefresh, dualVariantBatchGroups } from '@/utils/musicClipRefresh.util'

function mergeFeedItem(
  prev: MusicClipItem,
  fc: ReturnType<typeof feedClipToMusicItem>
): MusicClipItem {
  return {
    ...prev,
    ...fc,
    id: prev.id,
    pollAnchorClipId: prev.pollAnchorClipId || prev.clipId,
    serverJobId: prev.serverJobId,
    parentClipId: prev.parentClipId,
    stemGroupId: prev.stemGroupId,
    stemKind: prev.stemKind,
    taskId: prev.taskId || fc.taskId,
  }
}

function membersFromClips(clips: MusicClipItem[]): PollClipEntry[] {
  return clips.map(c => ({
    localId: c.id,
    clipId: c.clipId,
    sceneLabel: c.sceneLabel || '',
    createdAt: c.createdAt,
  }))
}

function applyFeedGroup(
  byLocalId: Map<string, MusicClipItem>,
  feedClips: SunoFeedClip[],
  group: MusicClipItem[]
) {
  applyFeedToPollGroup(feedClips, membersFromClips(group), {
    getClipRow: localId => byLocalId.get(localId),
    patchClip: (localId, patch) => {
      const prev = byLocalId.get(localId)
      if (!prev) return
      byLocalId.set(localId, {
        ...prev,
        ...patch,
        pollAnchorClipId: prev.pollAnchorClipId || prev.clipId,
      })
    },
    insertClip: row => {
      byLocalId.set(row.id, {
        ...row,
        pollAnchorClipId: row.pollAnchorClipId || row.clipId,
      })
    },
    mapFeedToItem: (fc, member) => {
      const prev = byLocalId.get(member.localId)
      const item = feedClipToMusicItem(fc, {
        localId: member.localId,
        sceneLabel: member.sceneLabel,
        createdAt: member.createdAt,
        lyricsText: prev?.lyricsText,
      })
      return prev ? mergeFeedItem(prev, item) : item
    },
  })
}

/** 批量从 feed 刷新缺失 audioUrl / 状态的曲目（历史任务恢复） */
export async function refreshMusicClipsFromFeed(
  model: string,
  clips: MusicClipItem[]
): Promise<MusicClipItem[]> {
  const modelKey = model.trim()
  if (!modelKey) return clips

  const byLocalId = new Map(clips.map(c => [c.id, { ...c }]))
  const allRows = () => [...byLocalId.values()]
  const groupedIds = new Set<string>()

  for (const group of dualVariantBatchGroups(allRows())) {
    for (const c of group) groupedIds.add(c.id)
    try {
      const feedClips = await fetchClipsForPoll(modelKey, membersFromClips(group), allRows())
      if (feedClips.length) applyFeedGroup(byLocalId, feedClips, group)
    } catch {
      /* ignore group */
    }
  }

  for (const clip of allRows()) {
    if (groupedIds.has(clip.id) || isClipGenerationSettled(clip) || !clip.clipId?.trim()) {
      continue
    }
    try {
      const feedClips = await fetchClipsForPoll(modelKey, membersFromClips([clip]), allRows())
      if (!feedClips.length) continue
      applyFeedGroup(byLocalId, feedClips, [clip])
    } catch {
      /* ignore */
    }
  }

  return reconcileAllClipStatuses([...byLocalId.values()]).sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  )
}
