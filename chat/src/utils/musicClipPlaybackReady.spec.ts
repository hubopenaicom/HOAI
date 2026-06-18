import { describe, expect, it } from 'vitest'
import type { MusicClipItem } from '@/types/music'
import {
  isClipGenerationSettled,
  isClipPlaybackReady,
  isClipPlayable,
  isPersistedLegacyComplete,
  reconcileClipStatusFromMedia,
} from '@/utils/musicClipPlaybackReady'

const base = (patch: Partial<MusicClipItem>): MusicClipItem => ({
  id: 'job-0',
  clipId: 'clip-a',
  title: '上班牛马',
  status: 'complete',
  createdAt: 1,
  ...patch,
})

describe('musicClipPlaybackReady', () => {
  it('cdn without duration and streaming status is still generating', () => {
    const clip = base({
      status: 'streaming',
      audioUrl: 'https://cdn1.suno.ai/clip-a.mp3',
      duration: 0,
    })
    expect(isClipPlaybackReady(clip)).toBe(false)
    expect(reconcileClipStatusFromMedia(clip).status).toBe('streaming')
    expect(isClipGenerationSettled(clip)).toBe(false)
  })

  it('cdn with duration is playback ready', () => {
    const clip = base({
      audioUrl: 'https://cdn1.suno.ai/clip-a.mp3',
      duration: 125.4,
    })
    expect(isClipPlaybackReady(clip)).toBe(true)
    expect(isClipPlayable(clip)).toBe(true)
    expect(reconcileClipStatusFromMedia(clip).status).toBe('complete')
  })

  it('legacy 不夜城: persisted complete + audiopipe without duration', () => {
    const clip = base({
      title: '不夜城',
      status: 'complete',
      audioUrl: 'https://audiopipe.suno.ai/?item_id=clip-a',
      duration: 0,
    })
    expect(isPersistedLegacyComplete(clip)).toBe(true)
    expect(reconcileClipStatusFromMedia(clip).status).toBe('complete')
    expect(isClipPlayable(clip)).toBe(true)
    expect(isClipGenerationSettled(clip)).toBe(true)
  })

  it('audiopipe while generating stays streaming', () => {
    const clip = base({
      status: 'streaming',
      audioUrl: 'https://audiopipe.suno.ai/?item_id=clip-a',
      duration: 0,
    })
    expect(reconcileClipStatusFromMedia(clip).status).toBe('streaming')
    expect(isClipPlayable(clip)).toBe(false)
    expect(isClipGenerationSettled(clip)).toBe(false)
  })

  it('stale cdn artifact without duration shows complete (不夜城 alt)', () => {
    const clip = base({
      title: '不夜城',
      status: 'streaming',
      createdAt: Date.now() - 60 * 60 * 1000,
      audioUrl: 'https://cdn1.suno.ai/0c4b6901-c621-4a8c-a86b-9106d4f8642b.mp3',
      imageUrl: 'https://cdn2.suno.ai/image_0c4b6901.jpeg',
      duration: 0,
    })
    expect(reconcileClipStatusFromMedia(clip).status).toBe('complete')
    expect(isClipPlayable(clip)).toBe(true)
    expect(isClipGenerationSettled(clip)).toBe(true)
  })

  it('fresh cdn placeholder without cover stays generating', () => {
    const clip = base({
      status: 'streaming',
      createdAt: Date.now() - 30 * 1000,
      audioUrl: 'https://cdn1.suno.ai/clip-a.mp3',
      duration: 0,
    })
    expect(reconcileClipStatusFromMedia(clip).status).toBe('streaming')
    expect(isClipPlayable(clip)).toBe(false)
  })
})
