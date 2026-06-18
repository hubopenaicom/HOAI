import type { MusicFormState } from '@/types/music'
import { adaptEditPayload, adaptStemPayload, inferPayloadStyle } from '@/utils/sunoPayloadAdapter'

function baseForm(overrides: Partial<MusicFormState> = {}): MusicFormState {
  return {
    primaryTab: 'edit',
    createMode: 'custom',
    editMode: 'extend',
    processMode: 'vocal_stems',
    toolsMode: 'upload',
    mv: 'chirp-v4',
    title: 'Test Song',
    tags: 'pop',
    prompt: 'verse lyrics',
    gptDescriptionPrompt: '',
    makeInstrumental: false,
    targetClipId: 'clip-aaa-bbbb',
    continueAt: 30,
    infillStartS: 10,
    infillEndS: 20,
    overpaintingStartS: 0,
    overpaintingEndS: 60,
    underpaintingStartS: 0,
    underpaintingEndS: 60,
    sourceIsUpload: false,
    negativeTags: '',
    styleWeight: null,
    weirdnessConstraint: null,
    vocalGender: '',
    personaId: '',
    artistClipId: '',
    concatClipId: '',
    concatIsInfill: false,
    personaName: '',
    personaDescription: '',
    personaRootClipId: '',
    personaIsPublic: false,
    audioWeight: null,
    useLyricsFirst: false,
    ...overrides,
  }
}

const ctxWithTask = { clipId: 'clip-aaa-bbbb', taskId: 'task-111' }
const ctxNoTask = { clipId: 'clip-aaa-bbbb' }

describe('inferPayloadStyle', () => {
  it('returns submit when taskId present', () => {
    expect(inferPayloadStyle(ctxWithTask)).toBe('submit')
  })
  it('returns generate without taskId', () => {
    expect(inferPayloadStyle(ctxNoTask)).toBe('generate')
  })
})

describe('adaptEditPayload — extend', () => {
  it('includes mv and task_id for submit style', () => {
    const payload = adaptEditPayload(baseForm({ editMode: 'extend' }), ctxWithTask, 'submit')
    expect(payload?.continue_clip_id).toBe('clip-aaa-bbbb')
    expect(payload?.mv).toBe('chirp-v4')
    expect(payload?.task_id).toBe('task-111')
    expect(payload?.task).toBe('extend')
  })
  it('uses upload_extend when sourceIsUpload', () => {
    const payload = adaptEditPayload(
      baseForm({ editMode: 'extend', sourceIsUpload: true }),
      ctxWithTask,
      'submit'
    )
    expect(payload?.task).toBe('upload_extend')
  })
})

describe('adaptEditPayload — infill', () => {
  it('submit style uses continue_clip_id and tau mv', () => {
    const payload = adaptEditPayload(baseForm({ editMode: 'infill' }), ctxWithTask, 'submit')
    expect(payload?.task).toBe('infill')
    expect(payload?.continue_clip_id).toBe('clip-aaa-bbbb')
    expect(payload?.mv).toBe('chirp-v4-tau')
    expect(payload?.task_id).toBe('task-111')
  })
  it('generate style uses infill_clip_id', () => {
    const payload = adaptEditPayload(baseForm({ editMode: 'infill' }), ctxNoTask, 'generate')
    expect(payload?.infill_clip_id).toBe('clip-aaa-bbbb')
    expect(payload?.task).toBeUndefined()
  })
})

describe('adaptEditPayload — cover', () => {
  it('sets cover task and tau mv for v4', () => {
    const payload = adaptEditPayload(baseForm({ editMode: 'cover' }), ctxWithTask, 'submit')
    expect(payload?.task).toBe('cover')
    expect(payload?.cover_clip_id).toBe('clip-aaa-bbbb')
    expect(payload?.mv).toBe('chirp-v4-tau')
  })
  it('uses native mv for v5.5 fenix', () => {
    const payload = adaptEditPayload(
      baseForm({ editMode: 'cover', mv: 'chirp-fenix' }),
      ctxWithTask,
      'submit'
    )
    expect(payload?.mv).toBe('chirp-fenix')
  })
})

describe('adaptEditPayload — underpainting / add_vocals', () => {
  it('underpainting uses underpainting_clip_id', () => {
    const payload = adaptEditPayload(baseForm({ editMode: 'underpainting' }), ctxWithTask)
    expect(payload?.task).toBe('underpainting')
    expect(payload?.underpainting_clip_id).toBe('clip-aaa-bbbb')
  })
  it('add_vocals uses overpainting task', () => {
    const payload = adaptEditPayload(baseForm({ editMode: 'add_vocals', tags: '' }), {
      clipId: 'clip-aaa-bbbb',
      taskId: 't1',
      tags: 'rock',
    })
    expect(payload?.task).toBe('overpainting')
    expect(payload?.tags).toBe('rock')
  })
})

describe('adaptStemPayload', () => {
  it('generate style without task_id uses vocal-stems shorthand', () => {
    const payload = adaptStemPayload(
      'clip-x',
      'vocal_stems',
      { title: 'T', mv: 'chirp-auk' },
      ctxNoTask,
      'generate'
    )
    expect(payload.task).toBe('vocal-stems')
    expect(payload.clip_id).toBe('clip-x')
  })
  it('submit style uses gen_stem twelve for all_stems', () => {
    const payload = adaptStemPayload(
      'clip-x',
      'all_stems',
      { title: 'T', mv: 'chirp-fenix' },
      ctxWithTask,
      'submit'
    )
    expect(payload.task).toBe('gen_stem')
    expect(payload.stem_task).toBe('twelve')
    expect(payload.task_id).toBe('task-111')
    expect(payload.mv).toBe('chirp-fenix')
  })
})
