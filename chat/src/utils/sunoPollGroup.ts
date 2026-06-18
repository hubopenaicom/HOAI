import type { MusicClipItem } from '@/types/music'
import { feedClipToMusicItem, type SunoFeedClip } from '@/utils/sunoFeedParse'
import { isClipGenerationSettled } from '@/utils/musicClipPlaybackReady'

/** Suno 一次生成固定产出 2 个变体 */
export const SUNO_VARIANTS_PER_GENERATE = 2

export interface PollGroupMember {
  localId: string
  clipId: string
  sceneLabel: string
  createdAt: number
}

export function resolveMemberClipId(
  member: PollGroupMember,
  getClipRow: (localId: string) => MusicClipItem | undefined
): string {
  const row = getClipRow(member.localId)
  return String(row?.clipId ?? member.clipId).trim()
}

/** 将 generate 响应扩展为双变体占位（第二槽 clipId 为空，待 feed 回填） */
export function expandGenerateClipsToVariantSlots(
  generated: { id: string; status: MusicClipItem['status'] }[]
): { id: string; status: MusicClipItem['status'] }[] {
  if (generated.length !== 1) return generated
  return [generated[0], { id: '', status: 'queued' }]
}

function feedClipId(fc: SunoFeedClip): string {
  return String(fc.id ?? fc.clip_id ?? '').trim()
}

/**
 * 将 feed 结果同步到轮询组：处理占位 id 替换、追加第二变体、持续更新全部成员。
 */
export function applyFeedToPollGroup(
  feedClips: SunoFeedClip[],
  members: PollGroupMember[],
  options: {
    getClipRow: (localId: string) => MusicClipItem | undefined
    patchClip: (localId: string, patch: Partial<MusicClipItem>) => void
    insertClip: (row: MusicClipItem) => void
    mapFeedToItem?: (fc: SunoFeedClip, member: PollGroupMember) => MusicClipItem
  }
): PollGroupMember[] {
  if (!feedClips.length || !members.length) return members

  const ent0 = members[0]
  let nextMembers = [...members]
  const feedIds = feedClips.map(feedClipId).filter(Boolean)
  const memberClipIds = nextMembers.map(m => resolveMemberClipId(m, options.getClipRow))

  const anyMemberInFeed = memberClipIds.some(id => id && feedIds.includes(id))

  if (!anyMemberInFeed) {
    for (let i = 0; i < Math.min(nextMembers.length, feedClips.length); i++) {
      const fc = feedClips[i]
      const clipId = feedClipId(fc)
      if (!clipId) continue
      const member = nextMembers[i]
      const prev = options.getClipRow(member.localId)
      const item = options.mapFeedToItem
        ? options.mapFeedToItem(fc, member)
        : feedClipToMusicItem(fc, {
            localId: member.localId,
            sceneLabel: member.sceneLabel,
            createdAt: member.createdAt,
            lyricsText: prev?.lyricsText,
          })
      options.patchClip(member.localId, { ...item, clipId })
      nextMembers[i] = { ...member, clipId }
    }
  }

  while (nextMembers.length < feedClips.length) {
    const j = nextMembers.length
    const fc = feedClips[j]
    const clipId = feedClipId(fc)
    if (!clipId) break

    const alreadyTracked = nextMembers.some(
      m => resolveMemberClipId(m, options.getClipRow) === clipId
    )
    if (alreadyTracked) break

    const localId = `${ent0.localId}-alt-${j}`
    const row = feedClipToMusicItem(fc, {
      localId,
      sceneLabel: ent0.sceneLabel,
      createdAt: ent0.createdAt,
      lyricsText: options.getClipRow(ent0.localId)?.lyricsText,
    })
    options.insertClip(row)
    nextMembers.push({
      localId,
      clipId,
      sceneLabel: ent0.sceneLabel,
      createdAt: ent0.createdAt,
    })
  }

  const claimedFeedIds = new Set(
    nextMembers.map(m => resolveMemberClipId(m, options.getClipRow)).filter(Boolean)
  )
  const emptyMembers = nextMembers.filter(m => !resolveMemberClipId(m, options.getClipRow))
  const unclaimedFeed = feedClips.filter(fc => {
    const id = feedClipId(fc)
    return id && !claimedFeedIds.has(id)
  })
  for (let i = 0; i < emptyMembers.length && i < unclaimedFeed.length; i++) {
    const member = emptyMembers[i]
    const fc = unclaimedFeed[i]
    const clipId = feedClipId(fc)
    const prev = options.getClipRow(member.localId)
    const item = options.mapFeedToItem
      ? options.mapFeedToItem(fc, member)
      : feedClipToMusicItem(fc, {
          localId: member.localId,
          sceneLabel: member.sceneLabel,
          createdAt: member.createdAt,
          lyricsText: prev?.lyricsText,
        })
    options.patchClip(member.localId, { ...item, clipId })
    const idx = nextMembers.findIndex(m => m.localId === member.localId)
    if (idx >= 0) nextMembers[idx] = { ...member, clipId }
    claimedFeedIds.add(clipId)
  }

  for (const member of nextMembers) {
    const clipId = resolveMemberClipId(member, options.getClipRow)
    if (!clipId) continue
    const fc = feedClips.find(x => feedClipId(x) === clipId)
    if (!fc) continue
    const prev = options.getClipRow(member.localId)
    const item = options.mapFeedToItem
      ? options.mapFeedToItem(fc, member)
      : feedClipToMusicItem(fc, {
          localId: member.localId,
          sceneLabel: member.sceneLabel,
          createdAt: member.createdAt,
          lyricsText: prev?.lyricsText,
        })
    options.patchClip(member.localId, item)
  }

  return nextMembers
}

export function isPollGroupAllDone(
  members: PollGroupMember[],
  getClipRow: (localId: string) => MusicClipItem | undefined
): boolean {
  if (!members.length) return false
  return members.every(m => {
    const row = getClipRow(m.localId)
    return row != null && isClipGenerationSettled(row)
  })
}
