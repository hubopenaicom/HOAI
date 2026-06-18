import { describe, expect, it } from 'vitest'
import {
  normalizeSunoModelVersion,
  SUNO_DEFAULT_MODEL_VERSION,
  SUNO_MV_SELECT_OPTIONS,
  isSunoModelVersion,
} from '@/types/music'
import { resolveSunoMvForEditMode } from '@/utils/sunoEditMvPolicy'

describe('Suno model versions', () => {
  it('defaults to latest chirp-fenix', () => {
    expect(SUNO_DEFAULT_MODEL_VERSION).toBe('chirp-fenix')
    expect(normalizeSunoModelVersion(undefined)).toBe('chirp-fenix')
    expect(normalizeSunoModelVersion('chirp-v4')).toBe('chirp-v4')
  })

  it('migrates deprecated mv to default', () => {
    expect(normalizeSunoModelVersion('chirp-v3-5')).toBe('chirp-fenix')
    expect(normalizeSunoModelVersion('chirp-v3.0')).toBe('chirp-fenix')
  })

  it('excludes deprecated from select options', () => {
    const values = SUNO_MV_SELECT_OPTIONS.map(o => o.value)
    expect(values).not.toContain('chirp-v3-5')
    expect(values[0]).toBe('chirp-fenix')
    expect(isSunoModelVersion('chirp-v3-5')).toBe(false)
  })
})

describe('resolveSunoMvForEditMode', () => {
  it('locks bluejay for overpainting modes', () => {
    expect(resolveSunoMvForEditMode('overpainting', 'chirp-fenix')).toBe('chirp-bluejay')
  })

  it('defaults extend to fenix when leaving bluejay mode', () => {
    expect(resolveSunoMvForEditMode('extend', 'chirp-bluejay', 'overpainting')).toBe('chirp-fenix')
  })

  it('upgrades legacy auk for extend', () => {
    expect(resolveSunoMvForEditMode('extend', 'chirp-auk')).toBe('chirp-fenix')
  })

  it('keeps crow when switching extend to reference', () => {
    expect(resolveSunoMvForEditMode('reference', 'chirp-crow', 'extend')).toBe('chirp-crow')
  })

  it('upgrades legacy auk for cover to fenix', () => {
    expect(resolveSunoMvForEditMode('cover', 'chirp-auk')).toBe('chirp-fenix')
  })
})
