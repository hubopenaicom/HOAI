import type { MusicFormState } from '@/types/music'
import { applyAdvancedParamsToPayload } from '@/utils/sunoAdvancedMetadata'
import type { SunoClipContext } from '@/utils/sunoClipContext'

export type SunoPayloadStyle = 'submit' | 'generate'

function trim(s: string) {
  return (s || '').trim()
}

/** 有 task_id 时倾向 submit 风格（doc-1 / ephone） */
export function inferPayloadStyle(ctx?: SunoClipContext): SunoPayloadStyle {
  if (ctx?.taskId?.trim()) return 'submit'
  return 'generate'
}

function withTaskId(body: Record<string, unknown>, ctx?: SunoClipContext): Record<string, unknown> {
  const tid = ctx?.taskId?.trim()
  if (tid) body.task_id = tid
  return body
}

function tauMv(form: MusicFormState): string {
  const mv = form.mv
  if (mv === 'chirp-v4') return 'chirp-v4-tau'
  if (
    mv === 'chirp-fenix' ||
    mv === 'chirp-crow' ||
    mv === 'chirp-bluejay' ||
    mv === 'chirp-auk-turbo' ||
    mv === 'chirp-auk'
  ) {
    return mv
  }
  return 'chirp-v4-tau'
}

/** submit 风格 infill（doc-1 场景八） */
function buildSubmitInfillPayload(
  form: MusicFormState,
  clip: string,
  ctx?: SunoClipContext
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    task: 'infill',
    continue_clip_id: clip,
    continue_at: null,
    continued_aligned_prompt: null,
    infill_start_s: form.infillStartS ?? 0,
    infill_end_s: form.infillEndS ?? 0,
    mv: form.sourceIsUpload ? form.mv : tauMv(form),
    generation_type: 'TEXT',
    negative_tags: '',
    prompt: trim(form.prompt),
    tags: trim(form.tags),
    title: trim(form.title),
  }
  if (form.sourceIsUpload) {
    body.task = 'upload_infill'
    body.infill_clip_id = clip
    delete body.continue_clip_id
  }
  return withTaskId(body, ctx)
}

/** generate 风格 infill（doc-4） */
function buildGenerateInfillPayload(form: MusicFormState, clip: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    infill_clip_id: clip,
    infill_start_s: form.infillStartS ?? 0,
    infill_end_s: form.infillEndS ?? 0,
    prompt: trim(form.prompt),
    tags: trim(form.tags),
    title: trim(form.title),
  }
  if (form.sourceIsUpload) {
    body.mv = form.mv
    body.task = 'upload_infill'
  }
  return body
}

export function adaptEditPayload(
  form: MusicFormState,
  ctx?: SunoClipContext,
  style?: SunoPayloadStyle
): Record<string, unknown> | null {
  const clip = trim(form.targetClipId)
  if (!clip) return null
  const payloadStyle = style ?? inferPayloadStyle(ctx)
  const mv = form.mv

  if (form.editMode === 'cover') {
    const body = applyAdvancedParamsToPayload(
      {
        task: 'cover',
        cover_clip_id: clip,
        mv: tauMv(form),
        prompt: trim(form.prompt),
        tags: trim(form.tags),
        title: trim(form.title),
        generation_type: 'TEXT',
      },
      form,
      { coverMode: true }
    )
    return withTaskId(body, ctx)
  }

  if (form.editMode === 'extend') {
    const body: Record<string, unknown> = {
      continue_clip_id: clip,
      continue_at: form.continueAt ?? 0,
      prompt: trim(form.prompt),
      tags: trim(form.tags),
      title: trim(form.title),
      mv,
      make_instrumental: false,
    }
    if (form.sourceIsUpload) {
      body.task = 'upload_extend'
    } else {
      body.task = 'extend'
    }
    return withTaskId(body, ctx)
  }

  if (form.editMode === 'reference') {
    const body: Record<string, unknown> = {
      reference_clip_id: clip,
      prompt: trim(form.prompt),
      tags: trim(form.tags),
      title: trim(form.title),
    }
    if (form.sourceIsUpload) {
      body.mv = mv
      body.task = 'upload_reference'
    }
    return withTaskId(body, ctx)
  }

  if (form.editMode === 'infill') {
    if (payloadStyle === 'submit' && !form.sourceIsUpload) {
      return buildSubmitInfillPayload(form, clip, ctx)
    }
    return buildGenerateInfillPayload(form, clip)
  }

  if (form.editMode === 'rewrite') {
    return withTaskId({ clip_id: clip, task: 'rewrite' }, ctx)
  }

  if (form.editMode === 'overpainting' || form.editMode === 'add_vocals') {
    const tags = trim(form.tags) || (form.editMode === 'add_vocals' ? trim(ctx?.tags || '') : '')
    return withTaskId(
      {
        mv: 'chirp-bluejay',
        overpainting_clip_id: clip,
        overpainting_start_s: form.overpaintingStartS ?? 0,
        overpainting_end_s: form.overpaintingEndS ?? 0,
        task: 'overpainting',
        prompt: trim(form.prompt),
        tags,
        title: trim(form.title),
        override_fields: ['prompt', 'tags'],
      },
      ctx
    )
  }

  if (form.editMode === 'underpainting') {
    return withTaskId(
      {
        mv: 'chirp-bluejay',
        underpainting_clip_id: clip,
        underpainting_start_s: form.underpaintingStartS ?? 0,
        underpainting_end_s: form.underpaintingEndS ?? 0,
        task: 'underpainting',
        prompt: '',
        tags: trim(form.tags),
        title: trim(form.title),
        override_fields: ['prompt', 'tags'],
      },
      ctx
    )
  }

  if (form.editMode === 'persona_sing') {
    const pid = trim(form.personaId)
    const aid = trim(form.artistClipId) || clip
    return withTaskId(
      {
        task: 'artist_consistency',
        mv: tauMv(form),
        persona_id: pid,
        artist_clip_id: aid,
        prompt: trim(form.prompt),
        tags: trim(form.tags),
        title: trim(form.title),
      },
      ctx
    )
  }

  return null
}

export function adaptStemPayload(
  continueClipId: string,
  mode: 'vocal_stems' | 'all_stems',
  form: Pick<MusicFormState, 'title' | 'mv'>,
  ctx?: SunoClipContext,
  style?: SunoPayloadStyle
): Record<string, unknown> {
  const payloadStyle = style ?? inferPayloadStyle(ctx)
  const allStems = mode === 'all_stems'

  if (payloadStyle === 'generate' && !ctx?.taskId) {
    return {
      clip_id: continueClipId,
      task: allStems ? 'all-stems' : 'vocal-stems',
    }
  }

  const body: Record<string, unknown> = {
    task: 'gen_stem',
    continue_clip_id: continueClipId,
    mv: form.mv,
    make_instrumental: true,
    generation_type: 'TEXT',
    title: trim(form.title) || (allStems ? 'All stems' : 'Vocal stems'),
    prompt: '',
    continued_aligned_prompt: null,
    continue_at: null,
    stem_type_id: 91,
    stem_type_group_name: allStems ? 'Twelve' : 'Two',
    stem_task: allStems ? 'twelve' : 'two',
  }
  return withTaskId(body, ctx)
}
