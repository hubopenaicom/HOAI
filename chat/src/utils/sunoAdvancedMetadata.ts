import type { MusicFormState } from '@/types/music'

function trim(s: string) {
  return (s || '').trim()
}

/** 将高阶参数合并进 generate payload（场景十/十三） */
export function applyAdvancedParamsToPayload(
  body: Record<string, unknown>,
  form: MusicFormState,
  options?: { coverMode?: boolean }
): Record<string, unknown> {
  const negative = trim(form.negativeTags)
  if (negative) body.negative_tags = negative

  if (form.primaryTab === 'create' && !body.generation_type) {
    body.generation_type = 'TEXT'
  }

  const sliders: Record<string, number> = {}
  const canSliders: string[] = []

  if (form.styleWeight != null && !Number.isNaN(form.styleWeight)) {
    sliders.style_weight = Math.min(1, Math.max(0, form.styleWeight))
    canSliders.push('style_weight')
  }
  if (form.weirdnessConstraint != null && !Number.isNaN(form.weirdnessConstraint)) {
    sliders.weirdness_constraint = Math.min(1, Math.max(0, form.weirdnessConstraint))
    canSliders.push('weirdness_constraint')
  }
  if (options?.coverMode && form.audioWeight != null && !Number.isNaN(form.audioWeight)) {
    sliders.audio_weight = Math.min(1, Math.max(0, form.audioWeight))
    canSliders.push('audio_weight')
  }

  const hasGender = form.vocalGender === 'f' || form.vocalGender === 'm'
  if (!canSliders.length && !hasGender) return body

  const prev =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? { ...(body.metadata as Record<string, unknown>) }
      : {}

  if (canSliders.length) {
    const prevSliders =
      prev.control_sliders && typeof prev.control_sliders === 'object'
        ? (prev.control_sliders as Record<string, number>)
        : {}
    prev.create_mode = 'custom'
    prev.control_sliders = { ...prevSliders, ...sliders }
    const prevCan = Array.isArray(prev.can_control_sliders)
      ? (prev.can_control_sliders as string[])
      : []
    prev.can_control_sliders = [...new Set([...prevCan, ...canSliders])]
    if (options?.coverMode) prev.is_remix = true
  }

  if (hasGender) prev.vocal_gender = form.vocalGender

  body.metadata = prev
  return body
}
