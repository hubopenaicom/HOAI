import type { MusicClipItem, SunoModelVersion, SunoVocalGender } from '@/types/music'
import type { SunoFeedClip } from '@/utils/sunoFeedParse'

function metaRecord(clip: SunoFeedClip): Record<string, unknown> | undefined {
  const meta = clip.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta))
    return meta as Record<string, unknown>
  return undefined
}

/** 从 Suno feed clip 提取模型与创作溯源字段 */
export function mergeClipProvenanceFromFeed(clip: SunoFeedClip): Partial<MusicClipItem> {
  const patch: Partial<MusicClipItem> = {}
  const modelName = String(clip.model_name ?? '').trim()
  if (modelName) patch.sunoModelName = modelName
  const major = String(clip.major_model_version ?? '').trim()
  if (major) patch.majorModelVersion = major
  const video = String(clip.video_url ?? '').trim()
  if (video) patch.videoUrl = video

  const meta = metaRecord(clip)
  if (meta) {
    const gpt = String(meta.gpt_description_prompt ?? '').trim()
    if (gpt) patch.gptDescriptionPrompt = gpt
    const neg = String(meta.negative_tags ?? '').trim()
    if (neg) patch.negativeTags = neg
    const type = String(meta.type ?? '').trim()
    if (type) patch.clipType = type
    const stemFrom = String(meta.stem_from_id ?? '').trim()
    if (stemFrom) patch.stemFromId = stemFrom
    if (meta.is_remix === true) patch.isRemix = true
    const vg = String(meta.vocal_gender ?? '').trim()
    if (vg === 'f' || vg === 'm') patch.vocalGender = vg
    const sliders = meta.control_sliders
    if (sliders && typeof sliders === 'object' && !Array.isArray(sliders)) {
      const s = sliders as Record<string, unknown>
      if (typeof s.style_weight === 'number') patch.styleWeight = s.style_weight
      if (typeof s.weirdness_constraint === 'number')
        patch.weirdnessConstraint = s.weirdness_constraint
      if (typeof s.audio_weight === 'number') patch.audioWeight = s.audio_weight
    }
  }
  return patch
}

export interface ClipCreationProvenance {
  modelKey?: string
  sunoMv?: SunoModelVersion
  gptDescriptionPrompt?: string
  negativeTags?: string
  styleWeight?: number | null
  weirdnessConstraint?: number | null
  vocalGender?: SunoVocalGender
  audioWeight?: number | null
  deductCharged?: number
  chargeMult?: number
  deductTypeSnapshot?: number
}

export function attachClipCreationProvenance(
  clip: MusicClipItem,
  provenance: ClipCreationProvenance,
  variantIndex?: number
): MusicClipItem {
  return {
    ...clip,
    ...provenance,
    variantIndex: variantIndex ?? clip.variantIndex,
    modelKey: provenance.modelKey || clip.modelKey,
    sunoMv: provenance.sunoMv || clip.sunoMv,
  }
}
