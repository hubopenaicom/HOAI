import { describe, expect, it } from 'vitest'
import type { MusicClipItem } from '@/types/music'
import {
  promoteClipStatusFromMedia,
  reconcileAllClipStatuses,
  reconcileStaleDualVariants,
} from '@/utils/musicClipStatus.util'

const base = (patch: Partial<MusicClipItem>): MusicClipItem => ({
  id: 'a',
  clipId: 'c1',
  title: '不夜城',
  status: 'streaming',
  createdAt: 100,
  sceneLabel: '场景1·灵感',
  ...patch,
})

describe('promoteClipStatusFromMedia', () => {
  it('promotes cdn mp3 with duration to complete', () => {
    const row = promoteClipStatusFromMedia(
      base({
        audioUrl: 'https://cdn1.suno.ai/d2873160-b635-4cd7-86c4-879cad7902b5.mp3',
        duration: 180,
      })
    )
    expect(row.status).toBe('complete')
  })

  it('keeps cdn mp3 without duration as streaming', () => {
    const row = promoteClipStatusFromMedia(
      base({
        audioUrl: 'https://cdn1.suno.ai/d2873160-b635-4cd7-86c4-879cad7902b5.mp3',
      })
    )
    expect(row.status).toBe('streaming')
  })

  it('keeps audiopipe as streaming when not persisted complete', () => {
    const row = promoteClipStatusFromMedia(
      base({
        status: 'streaming',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
      })
    )
    expect(row.status).toBe('streaming')
  })

  it('keeps legacy persisted complete audiopipe as complete', () => {
    const row = promoteClipStatusFromMedia(
      base({
        status: 'complete',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
      })
    )
    expect(row.status).toBe('complete')
  })
})

describe('reconcileStaleDualVariants', () => {
  it('does not mark alt complete when only sibling is ready', () => {
    const out = reconcileStaleDualVariants([
      base({
        id: 'job-0',
        clipId: 'main',
        status: 'complete',
        audioUrl: 'https://cdn1.suno.ai/main.mp3',
        duration: 120,
      }),
      base({
        id: 'job-1',
        clipId: 'alt',
        status: 'streaming',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=alt',
      }),
    ])
    const alt = out.find(c => c.id === 'job-1')
    expect(alt?.status).toBe('streaming')
  })
})

describe('reconcileAllClipStatuses', () => {
  it('applies promotion when cdn has duration', () => {
    const out = reconcileAllClipStatuses([
      base({
        id: 'job-0',
        status: 'queued',
        audioUrl: 'https://cdn1.suno.ai/x.mp3',
        duration: 90,
      }),
    ])
    expect(out[0]?.status).toBe('complete')
  })

  it('upgrades audiopipe to cdn mp3 when duration is known', () => {
    const out = reconcileAllClipStatuses([
      base({
        id: 'job-alt',
        clipId: '0c4b6901-c621-4a8c-a86b-9106d4f8642b',
        status: 'streaming',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
        duration: 142,
      }),
    ])
    expect(out[0]?.audioUrl).toBe('https://cdn1.suno.ai/0c4b6901-c621-4a8c-a86b-9106d4f8642b.mp3')
    expect(out[0]?.status).toBe('complete')
  })
})
