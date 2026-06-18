import { describe, expect, it } from 'vitest'
import { classifySunoMusicError, formatSunoMusicError } from './sunoErrorMessage'

describe('sunoErrorMessage', () => {
  it('classifies catalog match', () => {
    expect(classifySunoMusicError('Audio matches an existing recording in our catalog')).toBe(
      'catalog'
    )
  })

  it('classifies concat job missing', () => {
    expect(classifySunoMusicError('Job not exits')).toBe('concat_job')
  })

  it('classifies file size errors', () => {
    expect(classifySunoMusicError('payload too large')).toBe('size')
  })

  it('classifies record not found', () => {
    expect(classifySunoMusicError('record not found')).toBe('clip_not_found')
  })
})
