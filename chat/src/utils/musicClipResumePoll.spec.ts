import { describe, expect, it } from 'vitest'
import { groupPendingClipsForResume } from '@/utils/musicClipResumePoll'
import type { MusicClipItem } from '@/types/music'

describe('groupPendingClipsForResume', () => {
  it('groups pending dual variants by createdAt and sceneLabel', () => {
    const clips: MusicClipItem[] = [
      {
        id: 'job-0',
        clipId: 'a',
        title: 'T',
        status: 'queued',
        sceneLabel: '场景1·灵感',
        createdAt: 100,
      },
      {
        id: 'job-1',
        clipId: '',
        title: 'T',
        status: 'queued',
        sceneLabel: '场景1·灵感',
        createdAt: 100,
      },
      {
        id: 'done-1',
        clipId: 'x',
        title: 'Done',
        status: 'complete',
        audioUrl: 'https://cdn1.suno.ai/x.mp3',
        duration: 120,
        sceneLabel: '场景1·灵感',
        createdAt: 99,
      },
    ]
    const groups = groupPendingClipsForResume(clips)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
    expect(groups[0].map(m => m.localId).sort()).toEqual(['job-0', 'job-1'])
  })

  it('ignores stem child clips', () => {
    const groups = groupPendingClipsForResume([
      {
        id: 'stem-1',
        clipId: 's1',
        title: 'Vocal',
        status: 'queued',
        sceneLabel: '场景9·人声分离',
        createdAt: 1,
        parentClipId: 'parent',
      },
    ])
    expect(groups).toHaveLength(0)
  })
})
