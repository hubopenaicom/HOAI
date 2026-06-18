import { describe, expect, it } from 'vitest'
import type { MusicFormState } from '@/types/music'
import { SUNO_DEFAULT_MODEL_VERSION } from '@/types/music'
import {
  musicModeHelpContextKey,
  resolveMusicModeHelp,
  resolveMusicPrimaryTabHelp,
} from '@/utils/musicModeHelp'

function baseForm(overrides: Partial<MusicFormState> = {}): MusicFormState {
  return {
    primaryTab: 'create',
    createMode: 'inspire',
    editMode: 'extend',
    processMode: 'all_stems',
    toolsMode: 'upload',
    mv: SUNO_DEFAULT_MODEL_VERSION,
    useLyricsFirst: true,
    gptDescriptionPrompt: '',
    prompt: '',
    tags: '',
    title: '',
    makeInstrumental: false,
    targetClipId: '',
    continueAt: 0,
    infillStartS: 0,
    infillEndS: 30,
    overpaintingStartS: 0,
    overpaintingEndS: 30,
    underpaintingStartS: 0,
    underpaintingEndS: 30,
    sourceIsUpload: false,
    uploadAudioUrl: '',
    personaId: '',
    artistClipId: '',
    concatClipId: '',
    concatIsInfill: false,
    personaRootClipId: '',
    personaName: '',
    personaDescription: '',
    personaIsPublic: false,
    audioWeight: 0.5,
    styleWeight: 0.5,
    weirdnessConstraint: 0.5,
    vocalGender: '',
    negativeTags: '',
    ...overrides,
  }
}

describe('musicModeHelp', () => {
  it('resolves create inspire with lyrics-first tips', () => {
    const ctx = resolveMusicModeHelp(baseForm())
    expect(ctx.titleKey).toBe('music.createInspire')
    expect(ctx.bodyKey).toBe('music.modeHelpInspire')
    expect(ctx.sceneKey).toBe('music.sceneLabel1')
    expect(ctx.tipKeys).toContain('music.modeHelpInspireTipLyrics')
  })

  it('switches inspire body when lyrics-first is off', () => {
    const ctx = resolveMusicModeHelp(baseForm({ useLyricsFirst: false }))
    expect(ctx.bodyKey).toBe('music.modeHelpInspireDirect')
    expect(ctx.tipKeys).toContain('music.modeHelpInspireTipOneShot')
  })

  it('attaches mv policy for locked edit modes', () => {
    const ctx = resolveMusicModeHelp(baseForm({ primaryTab: 'edit', editMode: 'overpainting' }))
    expect(ctx.mvPolicyKey).toBe('music.mvPolicyBluejayRequired')
    expect(ctx.tipKeys).toContain('music.modeHelpBluejayRequired')
  })

  it('hides mv policy key for rewrite but keeps rewrite tip', () => {
    const ctx = resolveMusicModeHelp(baseForm({ primaryTab: 'edit', editMode: 'rewrite' }))
    expect(ctx.mvPolicyKey).toBe('music.mvPolicyRewrite')
    expect(ctx.tipKeys).toContain('music.modeHelpRewriteTipNoMv')
  })

  it('covers all tools modes', () => {
    for (const toolsMode of ['upload', 'tags', 'concat', 'persona', 'extend_concat'] as const) {
      const ctx = resolveMusicModeHelp(baseForm({ primaryTab: 'tools', toolsMode }))
      expect(ctx.titleKey).toBeTruthy()
      expect(ctx.bodyKey).toBeTruthy()
    }
  })

  it('builds stable context keys', () => {
    const a = musicModeHelpContextKey(baseForm())
    const b = musicModeHelpContextKey(baseForm({ useLyricsFirst: false }))
    expect(a).not.toBe(b)
    expect(a).toContain('create:inspire')
  })

  it('exposes primary tab help', () => {
    expect(resolveMusicPrimaryTabHelp('edit').titleKey).toBe('music.primaryEdit')
  })
})
