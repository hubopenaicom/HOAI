import { describe, expect, it } from 'vitest'
import type { MusicClipItem } from '@/types/music'
import {
  buildMusicClipDetail,
  findBatchSiblings,
  formatMusicDuration,
  inferClipSourceTypeKey,
} from '@/utils/musicClipDetail'

const base = (patch: Partial<MusicClipItem>): MusicClipItem => ({
  id: 'job-1',
  clipId: 'clip-a',
  title: '不夜城',
  status: 'complete',
  createdAt: 1000,
  sceneLabel: '场景1·灵感',
  ...patch,
})

describe('musicClipDetail', () => {
  it('formats duration', () => {
    expect(formatMusicDuration(125)).toBe('2:05')
  })

  it('infers upload source', () => {
    expect(inferClipSourceTypeKey(base({ isUploadClip: true }))).toBe('music.detailSourceUpload')
  })

  it('finds batch siblings by createdAt and sceneLabel', () => {
    const all = [
      base({ id: 'a', clipId: 'clip-a', variantIndex: 0 }),
      base({ id: 'b', clipId: 'clip-b', variantIndex: 1 }),
      base({ id: 'c', clipId: 'other', createdAt: 2000 }),
    ]
    expect(findBatchSiblings(all[0]!, all)).toHaveLength(1)
    expect(findBatchSiblings(all[0]!, all)[0]?.id).toBe('b')
  })

  it('builds detail sections with models and lyrics', () => {
    const detail = buildMusicClipDetail(
      base({
        modelKey: 'suno-v1',
        sunoMv: 'chirp-fenix',
        sunoModelName: 'chirp-fenix',
        majorModelVersion: 'v5.5',
        lyricsText: '[Verse]\n夜之城',
        tags: 'pop electronic',
        deductCharged: 20,
        chargeMult: 2,
        deductTypeSnapshot: 2,
        styleWeight: 0.5,
      }),
      [],
      [{ model: 'suno-v1', modelName: 'Suno 音乐' }]
    )
    const models = detail.sections.find(s => s.id === 'models')
    expect(models?.rows.some(r => r.id === 'musicModelVersion')).toBe(true)
    expect(detail.sections.some(s => s.id === 'billing')).toBe(true)
    expect(detail.sections.some(s => s.id === 'advanced')).toBe(true)
    const creative = detail.sections.find(s => s.id === 'creative')
    expect(creative?.rows.some(r => r.id === 'lyrics')).toBe(true)
    expect(detail.rawMetadataJson).toContain('chirp-fenix')
  })

  it('resolves source clip for stem children', () => {
    const parent = base({ id: 'parent', clipId: 'parent-id', title: '不夜城' })
    const stem = base({ id: 'stem', clipId: 'stem-id', parentClipId: 'parent-id', title: 'Vocals' })
    const detail = buildMusicClipDetail(stem, [parent, stem])
    expect(detail.sourceClip?.clipId).toBe('parent-id')
  })
})
