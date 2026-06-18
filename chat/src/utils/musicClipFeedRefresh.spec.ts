import { describe, expect, it, vi } from 'vitest'
import { clipsNeedingFeedRefresh, dualVariantBatchGroups } from '@/utils/musicClipRefresh.util'
import type { MusicClipItem } from '@/types/music'
import { refreshMusicClipsFromFeed } from '@/utils/musicClipFeedRefresh'

vi.mock('@/api/sunoMusic', () => ({
  sunoFeedAPI: vi.fn(),
  sunoFetchBatchAPI: vi.fn(),
}))

import { sunoFeedAPI } from '@/api/sunoMusic'

const base = (patch: Partial<MusicClipItem>): MusicClipItem => ({
  id: 'local-1',
  clipId: 'clip-abc',
  title: 'T',
  status: 'complete',
  createdAt: 1,
  ...patch,
})

describe('clipsNeedingFeedRefresh', () => {
  it('includes in-progress cdn placeholder without duration', () => {
    const list = [
      base({
        status: 'streaming',
        audioUrl: 'https://cdn1.suno.ai/x.mp3',
        duration: 0,
      }),
    ]
    expect(clipsNeedingFeedRefresh(list)).toHaveLength(1)
  })

  it('skips playback-ready clips', () => {
    const list = [
      base({
        status: 'complete',
        audioUrl: 'https://cdn1.suno.ai/x.mp3',
        duration: 120,
      }),
    ]
    expect(clipsNeedingFeedRefresh(list)).toHaveLength(0)
  })

  it('includes streaming clips', () => {
    const list = [base({ status: 'streaming' })]
    expect(clipsNeedingFeedRefresh(list)).toHaveLength(1)
  })
})

describe('dualVariantBatchGroups', () => {
  it('groups pending empty-slot variant with anchor clip', () => {
    const groups = dualVariantBatchGroups([
      base({ id: 'a', clipId: 'real-a', sceneLabel: 'Cover', createdAt: 100, status: 'complete' }),
      base({ id: 'b', clipId: '', sceneLabel: 'Cover', createdAt: 100, status: 'queued' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })
})

describe('refreshMusicClipsFromFeed', () => {
  it('fills empty-slot variant from anchor feed batch', async () => {
    vi.mocked(sunoFeedAPI).mockResolvedValueOnce({
      data: [
        {
          id: 'real-a',
          status: 'complete',
          audio_url: 'https://cdn1.suno.ai/a.mp3',
          duration: 120,
        },
        {
          id: 'real-b',
          status: 'complete',
          audio_url: 'https://cdn1.suno.ai/b.mp3',
          duration: 118,
        },
      ],
    } as never)

    const out = await refreshMusicClipsFromFeed('suno-music', [
      base({
        id: 'job-0',
        clipId: 'real-a',
        pollAnchorClipId: 'anchor-a',
        sceneLabel: 'Cover',
        createdAt: 100,
        status: 'streaming',
        audioUrl: undefined,
      }),
      base({
        id: 'job-1',
        clipId: '',
        sceneLabel: 'Cover',
        createdAt: 100,
        status: 'queued',
        audioUrl: undefined,
      }),
    ])

    const slot2 = out.find(c => c.id === 'job-1')
    expect(slot2?.clipId).toBe('real-b')
    expect(slot2?.status).toBe('complete')
    expect(slot2?.audioUrl).toBe('https://cdn1.suno.ai/b.mp3')
  })
})
