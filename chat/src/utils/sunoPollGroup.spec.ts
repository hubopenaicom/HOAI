import { describe, expect, it, vi } from 'vitest'
import type { MusicClipItem } from '@/types/music'
import {
  applyFeedToPollGroup,
  expandGenerateClipsToVariantSlots,
  isPollGroupAllDone,
} from '@/utils/sunoPollGroup'

const readyFeed = (id: string) => ({
  id,
  status: 'complete' as const,
  audio_url: `https://cdn1.suno.ai/${id}.mp3`,
  duration: 120,
})

describe('expandGenerateClipsToVariantSlots', () => {
  it('adds second queued slot when API returns one clip', () => {
    const slots = expandGenerateClipsToVariantSlots([{ id: 'placeholder-1', status: 'submitted' }])
    expect(slots).toHaveLength(2)
    expect(slots[0].id).toBe('placeholder-1')
    expect(slots[1]).toEqual({ id: '', status: 'queued' })
  })

  it('keeps multiple clips unchanged', () => {
    const input = [
      { id: 'a', status: 'submitted' as const },
      { id: 'b', status: 'submitted' as const },
    ]
    expect(expandGenerateClipsToVariantSlots(input)).toEqual(input)
  })
})

describe('applyFeedToPollGroup', () => {
  it('rebinds placeholder ids and keeps polling both variants', () => {
    const rows = new Map<string, MusicClipItem>()
    const ent0 = {
      localId: 'job-1-0',
      clipId: 'placeholder',
      sceneLabel: 'Cover',
      createdAt: 1,
    }
    const ent1 = {
      localId: 'job-1-1',
      clipId: '',
      sceneLabel: 'Cover',
      createdAt: 1,
    }
    rows.set(ent0.localId, {
      id: ent0.localId,
      clipId: 'placeholder',
      title: 'p',
      status: 'queued',
      createdAt: 1,
    })
    rows.set(ent1.localId, {
      id: ent1.localId,
      clipId: '',
      title: 'slot2',
      status: 'queued',
      createdAt: 1,
    })

    const patchClip = vi.fn((localId: string, patch: Partial<MusicClipItem>) => {
      const prev = rows.get(localId)!
      rows.set(localId, { ...prev, ...patch })
    })
    const insertClip = vi.fn()

    let members = applyFeedToPollGroup(
      [
        {
          id: 'real-a',
          status: 'streaming',
          audio_url: 'https://audiopipe.suno.ai/?item_id=real-a',
        },
        {
          id: 'real-b',
          status: 'streaming',
          audio_url: 'https://audiopipe.suno.ai/?item_id=real-b',
        },
      ],
      [ent0, ent1],
      {
        getClipRow: id => rows.get(id),
        patchClip,
        insertClip,
      }
    )

    expect(members).toHaveLength(2)
    expect(rows.get('job-1-0')?.clipId).toBe('real-a')
    expect(rows.get('job-1-1')?.clipId).toBe('real-b')
    expect(rows.get('job-1-1')?.status).toBe('streaming')

    members = applyFeedToPollGroup(
      [
        readyFeed('real-a'),
        {
          id: 'real-b',
          status: 'streaming',
          audio_url: 'https://audiopipe.suno.ai/?item_id=real-b',
        },
      ],
      members,
      {
        getClipRow: id => rows.get(id),
        patchClip,
        insertClip,
      }
    )

    expect(rows.get('job-1-0')?.status).toBe('complete')
    expect(rows.get('job-1-1')?.status).toBe('streaming')
    expect(isPollGroupAllDone(members, id => rows.get(id))).toBe(false)

    applyFeedToPollGroup([readyFeed('real-a'), readyFeed('real-b')], members, {
      getClipRow: id => rows.get(id),
      patchClip,
      insertClip,
    })

    expect(isPollGroupAllDone(members, id => rows.get(id))).toBe(true)
  })

  it('assigns unclaimed feed clip to pre-created empty second slot', () => {
    const rows = new Map<string, MusicClipItem>()
    const ent0 = {
      localId: 'job-0',
      clipId: 'real-a',
      sceneLabel: 'Cover',
      createdAt: 1,
    }
    const ent1 = {
      localId: 'job-1',
      clipId: '',
      sceneLabel: 'Cover',
      createdAt: 1,
    }
    rows.set(ent0.localId, {
      id: ent0.localId,
      clipId: 'real-a',
      title: 'a',
      status: 'complete',
      audioUrl: 'https://cdn1.suno.ai/real-a.mp3',
      duration: 120,
      createdAt: 1,
    })
    rows.set(ent1.localId, {
      id: ent1.localId,
      clipId: '',
      title: 'b',
      status: 'queued',
      createdAt: 1,
    })

    applyFeedToPollGroup([readyFeed('real-a'), readyFeed('real-b')], [ent0, ent1], {
      getClipRow: id => rows.get(id),
      patchClip: (localId, patch) => {
        const prev = rows.get(localId)!
        rows.set(localId, { ...prev, ...patch })
      },
      insertClip: () => undefined,
    })

    expect(rows.get('job-1')?.clipId).toBe('real-b')
    expect(rows.get('job-1')?.status).toBe('complete')
  })
})
