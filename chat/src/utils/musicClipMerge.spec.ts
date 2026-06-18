import { describe, expect, it } from 'vitest'
import { mergeMusicClipLists } from '@/utils/musicClipMerge'
import type { MusicClipItem } from '@/types/music'

describe('mergeMusicClipLists', () => {
  it('merges by clipId and prefers complete status', () => {
    const local: MusicClipItem[] = [
      {
        id: 'job-1',
        clipId: 'abc',
        title: 'Local',
        status: 'streaming',
        createdAt: 100,
      },
    ]
    const cloud: MusicClipItem[] = [
      {
        id: 'srv-9',
        clipId: 'abc',
        title: 'Cloud',
        status: 'complete',
        audioUrl: 'https://cdn.example/a.mp3',
        createdAt: 90,
      },
    ]
    const merged = mergeMusicClipLists(local, cloud)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.status).toBe('complete')
    expect(merged[0]?.audioUrl).toBe('https://cdn.example/a.mp3')
    expect(merged[0]?.title).toBe('Cloud')
  })

  it('keeps dual-variant rows when second slot has empty clipId', () => {
    const merged = mergeMusicClipLists([
      {
        id: 'job-100-0',
        clipId: 'real-a',
        title: 'A',
        status: 'complete',
        createdAt: 100,
      },
      {
        id: 'job-100-1',
        clipId: '',
        title: 'B',
        status: 'queued',
        createdAt: 100,
      },
    ])
    expect(merged).toHaveLength(2)
    expect(merged.map(c => c.id).sort()).toEqual(['job-100-0', 'job-100-1'])
  })

  it('does not collapse dual variants that briefly share placeholder clipId', () => {
    const merged = mergeMusicClipLists([
      { id: 'job-1-0', clipId: 'placeholder', title: 'T', status: 'queued', createdAt: 1 },
      { id: 'job-1-1', clipId: '', title: 'T', status: 'queued', createdAt: 1 },
    ])
    expect(merged).toHaveLength(2)
  })
})
