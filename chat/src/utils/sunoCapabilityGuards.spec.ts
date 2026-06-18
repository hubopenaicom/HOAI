import { describe, expect, it } from 'vitest'
import {
  canCreatePersonaFromClip,
  canUsePersonaSing,
  isUploadSourceClip,
  SUNO_UPLOAD_MAX_FILE_BYTES,
} from './sunoCapabilityGuards'
import type { MusicClipItem } from '@/types/music'

const base: MusicClipItem = {
  id: 'local-1',
  clipId: 'abc-123',
  title: 't',
  status: 'complete',
  createdAt: 1,
}

describe('sunoCapabilityGuards', () => {
  it('detects upload source clips', () => {
    expect(isUploadSourceClip({ ...base, isUploadClip: true })).toBe(true)
    expect(isUploadSourceClip(base)).toBe(false)
  })

  it('blocks persona for upload clips', () => {
    expect(canCreatePersonaFromClip({ ...base, isUploadClip: true })).toBe(false)
    expect(canUsePersonaSing({ ...base, isUploadClip: true })).toBe(false)
    expect(canCreatePersonaFromClip(base)).toBe(true)
  })

  it('exposes 50MB upload limit', () => {
    expect(SUNO_UPLOAD_MAX_FILE_BYTES).toBe(50 * 1024 * 1024)
  })
})
