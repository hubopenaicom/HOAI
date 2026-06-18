import { describe, expect, it } from 'vitest'
import { formatApiErrorMessage } from './apiErrorMessage'
import { formatSunoMusicError } from './sunoErrorMessage'

describe('apiErrorMessage', () => {
  it('maps record not found to Chinese', () => {
    const msg = formatApiErrorMessage(
      { code: 502, message: 'record not found' },
      { url: '/music/suno/feed/abc', httpStatus: 502 }
    )
    expect(msg).toContain('找不到')
    expect(msg).not.toContain('record not found')
  })
})

describe('sunoErrorMessage record not found', () => {
  it('maps upstream record not found', () => {
    expect(formatSunoMusicError({ message: 'record not found' })).toContain('找不到')
  })
})
