import { describe, expect, it } from 'vitest'
import {
  checkUploadDurationForMv,
  recommendedUploadSecForMv,
  SUNO_UPLOAD_HARD_MAX_SEC,
} from './sunoMvLimits'

describe('sunoMvLimits', () => {
  it('maps mv to generation limits', () => {
    expect(recommendedUploadSecForMv('chirp-v4')).toBe(150)
    expect(recommendedUploadSecForMv('chirp-auk')).toBe(240)
    expect(recommendedUploadSecForMv('chirp-fenix')).toBe(480)
  })

  it('blocks over hard max', () => {
    const r = checkUploadDurationForMv(301, 'chirp-fenix')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('hard_max')
  })

  it('blocks over mv limit', () => {
    const r = checkUploadDurationForMv(230, 'chirp-v4')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('mv_exceeds')
  })

  it('allows 230s for chirp-auk', () => {
    expect(checkUploadDurationForMv(230, 'chirp-auk').ok).toBe(true)
  })

  it('warns between doc 120 and mv limit', () => {
    const r = checkUploadDurationForMv(145, 'chirp-auk')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warn).toBe('url_doc_exceed')
  })

  it('hard max is 300', () => {
    expect(SUNO_UPLOAD_HARD_MAX_SEC).toBe(300)
  })
})
