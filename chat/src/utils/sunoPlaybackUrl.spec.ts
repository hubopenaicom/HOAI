import { describe, expect, it } from 'vitest'
import {
  extractClipIdFromAudiopipeUrl,
  normalizeSunoPlaybackUrl,
  sunoCanonicalCdnMp3Url,
} from '@/utils/sunoPlaybackUrl'
import type { MusicClipItem } from '@/types/music'

const base = (patch: Partial<MusicClipItem>): MusicClipItem => ({
  id: 'job-alt',
  clipId: '0c4b6901-c621-4a8c-a86b-9106d4f8642b',
  title: '不夜城',
  status: 'streaming',
  createdAt: 1,
  ...patch,
})

describe('sunoPlaybackUrl', () => {
  it('builds canonical cdn mp3 url', () => {
    expect(sunoCanonicalCdnMp3Url('0c4b6901-c621-4a8c-a86b-9106d4f8642b')).toBe(
      'https://cdn1.suno.ai/0c4b6901-c621-4a8c-a86b-9106d4f8642b.mp3'
    )
  })

  it('extracts clip id from audiopipe url', () => {
    expect(
      extractClipIdFromAudiopipeUrl(
        'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b'
      )
    ).toBe('0c4b6901-c621-4a8c-a86b-9106d4f8642b')
  })

  it('keeps audiopipe while generating (no duration)', () => {
    const out = normalizeSunoPlaybackUrl(
      base({
        status: 'streaming',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
      })
    )
    expect(out.audioUrl).toContain('audiopipe.suno.ai')
    expect(out.status).toBe('streaming')
  })

  it('upgrades legacy persisted complete audiopipe to cdn mp3', () => {
    const out = normalizeSunoPlaybackUrl(
      base({
        status: 'complete',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
      })
    )
    expect(out.audioUrl).toBe('https://cdn1.suno.ai/0c4b6901-c621-4a8c-a86b-9106d4f8642b.mp3')
    expect(out.status).toBe('complete')
  })

  it('upgrades audiopipe to cdn mp3 when duration is known', () => {
    const out = normalizeSunoPlaybackUrl(
      base({
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
        duration: 128,
      })
    )
    expect(out.audioUrl).toBe('https://cdn1.suno.ai/0c4b6901-c621-4a8c-a86b-9106d4f8642b.mp3')
    expect(out.status).toBe('complete')
  })

  it('keeps existing cdn mp3 unchanged', () => {
    const url = 'https://cdn1.suno.ai/d2873160-b635-4cd7-86c4-879cad7902b5.mp3'
    const out = normalizeSunoPlaybackUrl(
      base({ clipId: 'd2873160-b635-4cd7-86c4-879cad7902b5', audioUrl: url, duration: 200 })
    )
    expect(out.audioUrl).toBe(url)
    expect(out.status).toBe('complete')
  })

  it('resolves clip id from audiopipe when clipId empty but does not upgrade without duration', () => {
    const out = normalizeSunoPlaybackUrl(
      base({
        clipId: '',
        audioUrl: 'https://audiopipe.suno.ai/?item_id=0c4b6901-c621-4a8c-a86b-9106d4f8642b',
      })
    )
    expect(out.clipId).toBe('0c4b6901-c621-4a8c-a86b-9106d4f8642b')
    expect(out.audioUrl).toContain('audiopipe.suno.ai')
  })
})
