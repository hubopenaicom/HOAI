import { describe, expect, it } from 'vitest'
import {
  coerceSunoMvForEditMode,
  getSunoEditMvPolicy,
  resolveSunoMvForEditMode,
} from '@/utils/sunoEditMvPolicy'

describe('sunoEditMvPolicy', () => {
  it('locks bluejay modes', () => {
    expect(getSunoEditMvPolicy('overpainting').uiMode).toBe('locked')
    expect(coerceSunoMvForEditMode('add_vocals', 'chirp-fenix')).toBe('chirp-bluejay')
  })

  it('hides mv for rewrite', () => {
    expect(getSunoEditMvPolicy('rewrite').uiMode).toBe('hidden')
  })

  it('allows fenix for cover and extend', () => {
    expect(coerceSunoMvForEditMode('cover', 'chirp-fenix')).toBe('chirp-fenix')
    expect(coerceSunoMvForEditMode('extend', 'chirp-fenix')).toBe('chirp-fenix')
  })

  it('upgrades legacy auk on extend', () => {
    expect(resolveSunoMvForEditMode('extend', 'chirp-auk')).toBe('chirp-fenix')
  })

  it('restores fenix when leaving overpainting', () => {
    expect(resolveSunoMvForEditMode('extend', 'chirp-bluejay', 'overpainting')).toBe('chirp-fenix')
  })

  it('keeps crow when switching extend to reference', () => {
    expect(resolveSunoMvForEditMode('reference', 'chirp-crow', 'extend')).toBe('chirp-crow')
  })
})
