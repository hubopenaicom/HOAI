import type { MusicClipItem, MusicProcessMode, MusicStemKind } from '@/types/music'
import type { SunoFeedClip } from '@/utils/sunoFeedParse'

export interface PollStemContext {
  parentClipId: string
  stemGroupId: string
  sceneLabel: string
}

const STEM_KIND_ORDER: MusicStemKind[] = [
  'vocals',
  'instrumental',
  'drums',
  'bass',
  'guitar',
  'piano',
  'other',
]

export function inferStemKind(title: string, tags?: string): MusicStemKind {
  const s = `${title} ${tags || ''}`.toLowerCase()
  if (/\bvocal|人声|voice\b/.test(s)) return 'vocals'
  if (/\binstrumental|伴奏|backing|no vocal|inst\b/.test(s)) return 'instrumental'
  if (/\bdrum|鼓\b/.test(s)) return 'drums'
  if (/\bbass|贝斯\b/.test(s)) return 'bass'
  if (/\bguitar|吉他\b/.test(s)) return 'guitar'
  if (/\bpiano|键盘|keyboard\b/.test(s)) return 'piano'
  return 'other'
}

export function stemKindLabelKey(kind: MusicStemKind): string {
  const map: Record<MusicStemKind, string> = {
    vocals: 'music.stemKindVocals',
    instrumental: 'music.stemKindInstrumental',
    drums: 'music.stemKindDrums',
    bass: 'music.stemKindBass',
    guitar: 'music.stemKindGuitar',
    piano: 'music.stemKindPiano',
    other: 'music.stemKindOther',
  }
  return map[kind]
}

export function sortStemClips(list: MusicClipItem[]): MusicClipItem[] {
  return [...list].sort((a, b) => {
    const ia = STEM_KIND_ORDER.indexOf(a.stemKind || 'other')
    const ib = STEM_KIND_ORDER.indexOf(b.stemKind || 'other')
    if (ia !== ib) return ia - ib
    return a.createdAt - b.createdAt
  })
}

export function getStemsForSource(clips: MusicClipItem[], parentClipId: string): MusicClipItem[] {
  return sortStemClips(clips.filter(c => c.parentClipId === parentClipId))
}

export function isStemChildClip(clip: MusicClipItem): boolean {
  return !!clip.parentClipId?.trim()
}

export function listClipsWithoutStemChildren(clips: MusicClipItem[]): MusicClipItem[] {
  return clips.filter(c => !isStemChildClip(c))
}

export function stemSceneLabel(mode: MusicProcessMode): string {
  return mode === 'all_stems' ? '场景8·全轨分离' : '场景9·人声分离'
}

export function stemChargeMult(mode: 'vocal_stems' | 'all_stems'): number {
  return mode === 'all_stems' ? 5 : 1
}

export function feedClipStemMeta(
  clip: SunoFeedClip,
  parentClipId: string,
  stemGroupId: string,
  sceneLabel: string
): Pick<MusicClipItem, 'parentClipId' | 'stemGroupId' | 'stemKind' | 'sceneLabel'> {
  const title = String(clip.title || '').trim()
  const tags = clip.tags != null ? String(clip.tags) : undefined
  return {
    parentClipId,
    stemGroupId,
    stemKind: inferStemKind(title, tags),
    sceneLabel,
  }
}
