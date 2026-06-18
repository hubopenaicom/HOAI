import type { MusicClipItem } from '@/types/music'
import { isClipGenerationSettled } from '@/utils/musicClipPlaybackReady'
import { listClipsWithoutStemChildren } from '@/utils/sunoStemUtils'
import type { PollGroupMember } from '@/utils/sunoPollGroup'

/** 将未完成任务按「同批创作」分组（createdAt + sceneLabel） */
export function groupPendingClipsForResume(clips: MusicClipItem[]): PollGroupMember[][] {
  const mains = listClipsWithoutStemChildren(clips)
  const groups = new Map<string, PollGroupMember[]>()

  for (const c of mains) {
    if (isClipGenerationSettled(c)) continue
    const key = `${c.createdAt}:${c.sceneLabel || ''}`
    const list = groups.get(key) ?? []
    list.push({
      localId: c.id,
      clipId: c.clipId,
      sceneLabel: c.sceneLabel || '',
      createdAt: c.createdAt,
    })
    groups.set(key, list)
  }

  return [...groups.values()].filter(members => members.length > 0)
}
