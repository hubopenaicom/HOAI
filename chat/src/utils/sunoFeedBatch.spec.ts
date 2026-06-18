import { vi } from 'vitest'

vi.mock('@/api/sunoMusic', () => ({
  sunoFeedAPI: vi.fn(),
  sunoFetchBatchAPI: vi.fn(),
}))

import { describe, expect, it } from 'vitest'
import { collectFeedQueryClipIds, parseBatchFetchToFeedClips } from '@/utils/sunoFeedBatch'
import type { MusicClipItem } from '@/types/music'
import { normalizeSunoClipStatus } from '@/utils/sunoFeedParse'

describe('parseBatchFetchToFeedClips', () => {
  it('parses envelope with nested data songs', () => {
    const clips = parseBatchFetchToFeedClips({
      code: 'success',
      data: [
        {
          status: 'SUCCESS',
          data: [
            { id: 'song-1', status: 'complete', title: 'A' },
            { id: 'song-2', status: 'streaming' },
          ],
        },
      ],
    })
    expect(clips).toHaveLength(2)
    expect(clips[0].id).toBe('song-1')
    expect(clips[0].status).toBe('complete')
  })

  it('skips failed tasks', () => {
    const clips = parseBatchFetchToFeedClips([
      { status: 'FAILURE', fail_reason: 'quota' },
      { status: 'SUCCESS', clips: [{ id: 'ok-1', status: 'complete' }] },
    ])
    expect(clips).toHaveLength(1)
    expect(clips[0].id).toBe('ok-1')
  })
})

describe('collectFeedQueryClipIds', () => {
  it('prefers poll anchor before current clip id', () => {
    const clipItems: MusicClipItem[] = [
      {
        id: 'job-0',
        clipId: 'final-a',
        pollAnchorClipId: 'anchor-x',
        title: 'T',
        status: 'streaming',
        createdAt: 1,
      },
    ]
    const ids = collectFeedQueryClipIds(
      [{ localId: 'job-0', clipId: 'final-a', sceneLabel: '', createdAt: 1 }],
      clipItems
    )
    expect(ids[0]).toBe('anchor-x')
    expect(ids).toContain('final-a')
  })
})

describe('normalizeSunoClipStatus', () => {
  it('maps succeeded state via feedClipToMusicItem path', () => {
    expect(normalizeSunoClipStatus('succeeded')).toBe('complete')
  })
})
