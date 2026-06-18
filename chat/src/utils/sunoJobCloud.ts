import type {
  MusicClipItem,
  MusicStemKind,
  SunoMidiState,
  SunoModelVersion,
  SunoTaskStatus,
  SunoVocalGender,
} from '@/types/music'
import { isSunoModelVersion } from '@/types/music'
import { mergeClipProvenanceFromFeed } from '@/utils/musicClipProvenance'
import { unwrapMusicApiData } from '@/utils/sunoApiUnwrap'
import { normalizeSunoPlaybackUrl } from '@/utils/sunoPlaybackUrl'
import type { SunoFeedClip } from '@/utils/sunoFeedParse'

export function clipToCloudJson(c: MusicClipItem): Record<string, unknown> {
  return {
    audio_url: c.audioUrl,
    image_url: c.imageUrl,
    video_url: c.videoUrl,
    tags: c.tags,
    duration: c.duration != null && c.duration > 0 ? c.duration : undefined,
    task_id: c.taskId,
    model_name: c.sunoModelName,
    major_model_version: c.majorModelVersion,
    prompt: c.lyricsText,
    metadata: buildCloudMetadata(c),
    music_studio: {
      parentClipId: c.parentClipId,
      stemGroupId: c.stemGroupId,
      stemKind: c.stemKind,
      isUploadClip: c.isUploadClip,
      taskId: c.taskId,
      pollAnchorClipId: c.pollAnchorClipId,
      midiState: c.midiState,
      serverJobId: c.serverJobId,
      modelKey: c.modelKey,
      sunoMv: c.sunoMv,
      gptDescriptionPrompt: c.gptDescriptionPrompt,
      negativeTags: c.negativeTags,
      clipType: c.clipType,
      stemFromId: c.stemFromId,
      isRemix: c.isRemix,
      variantIndex: c.variantIndex,
      deductCharged: c.deductCharged,
      chargeMult: c.chargeMult,
      deductTypeSnapshot: c.deductTypeSnapshot,
      styleWeight: c.styleWeight,
      weirdnessConstraint: c.weirdnessConstraint,
      vocalGender: c.vocalGender,
      audioWeight: c.audioWeight,
    },
  }
}

function buildCloudMetadata(c: MusicClipItem): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {}
  if (c.lyricsText) meta.prompt = c.lyricsText
  if (c.gptDescriptionPrompt) meta.gpt_description_prompt = c.gptDescriptionPrompt
  if (c.negativeTags) meta.negative_tags = c.negativeTags
  if (c.clipType) meta.type = c.clipType
  if (c.stemFromId) meta.stem_from_id = c.stemFromId
  if (c.isRemix) meta.is_remix = true
  if (c.vocalGender) meta.vocal_gender = c.vocalGender
  const sliders: Record<string, number> = {}
  if (c.styleWeight != null && Number.isFinite(c.styleWeight)) sliders.style_weight = c.styleWeight
  if (c.weirdnessConstraint != null && Number.isFinite(c.weirdnessConstraint)) {
    sliders.weirdness_constraint = c.weirdnessConstraint
  }
  if (c.audioWeight != null && Number.isFinite(c.audioWeight)) sliders.audio_weight = c.audioWeight
  if (Object.keys(sliders).length) meta.control_sliders = sliders
  return Object.keys(meta).length ? meta : undefined
}

export function studioFieldsFromCloudClip(
  clip: Record<string, unknown>
): Pick<
  MusicClipItem,
  | 'taskId'
  | 'pollAnchorClipId'
  | 'isUploadClip'
  | 'parentClipId'
  | 'stemGroupId'
  | 'stemKind'
  | 'midiState'
  | 'serverJobId'
  | 'modelKey'
  | 'sunoMv'
  | 'gptDescriptionPrompt'
  | 'negativeTags'
  | 'clipType'
  | 'stemFromId'
  | 'isRemix'
  | 'variantIndex'
  | 'sunoModelName'
  | 'majorModelVersion'
  | 'videoUrl'
  | 'deductCharged'
  | 'chargeMult'
  | 'deductTypeSnapshot'
  | 'styleWeight'
  | 'weirdnessConstraint'
  | 'vocalGender'
  | 'audioWeight'
> {
  const studio =
    clip.music_studio && typeof clip.music_studio === 'object' && !Array.isArray(clip.music_studio)
      ? (clip.music_studio as Record<string, unknown>)
      : {}

  const taskId = String(studio.taskId ?? clip.task_id ?? '').trim() || undefined
  const pollAnchorClipId =
    String(studio.pollAnchorClipId ?? clip.poll_anchor_clip_id ?? '').trim() || undefined
  const parentClipId = String(studio.parentClipId ?? clip.parent_clip_id ?? '').trim() || undefined
  const stemGroupId = String(studio.stemGroupId ?? clip.stem_group_id ?? '').trim() || undefined
  const stemKind = (studio.stemKind ?? clip.stem_kind) as MusicStemKind | undefined
  const isUploadClip = Boolean(studio.isUploadClip ?? clip.is_upload)
  const midiState = studio.midiState as SunoMidiState | undefined
  const serverJobRaw = studio.serverJobId ?? clip.server_job_id
  const serverJobId =
    serverJobRaw != null && Number.isFinite(Number(serverJobRaw)) ? Number(serverJobRaw) : undefined

  const modelKey = String(studio.modelKey ?? clip.model_key ?? '').trim() || undefined
  const sunoMvRaw = studio.sunoMv ?? clip.suno_mv
  const sunoMv = isSunoModelVersion(sunoMvRaw) ? (sunoMvRaw as SunoModelVersion) : undefined
  const gptDescriptionPrompt =
    String(studio.gptDescriptionPrompt ?? '').trim() ||
    String(
      (clip.metadata as Record<string, unknown> | undefined)?.gpt_description_prompt ?? ''
    ).trim() ||
    undefined
  const negativeTags =
    String(studio.negativeTags ?? '').trim() ||
    String((clip.metadata as Record<string, unknown> | undefined)?.negative_tags ?? '').trim() ||
    undefined
  const clipType =
    String(studio.clipType ?? '').trim() ||
    String((clip.metadata as Record<string, unknown> | undefined)?.type ?? '').trim() ||
    undefined
  const stemFromId =
    String(studio.stemFromId ?? '').trim() ||
    String((clip.metadata as Record<string, unknown> | undefined)?.stem_from_id ?? '').trim() ||
    undefined
  const isRemix = Boolean(
    studio.isRemix ?? (clip.metadata as Record<string, unknown> | undefined)?.is_remix
  )
  const variantRaw = studio.variantIndex ?? clip.variant_index
  const variantIndex =
    variantRaw != null && Number.isFinite(Number(variantRaw)) ? Number(variantRaw) : undefined
  const sunoModelName = String(clip.model_name ?? studio.sunoModelName ?? '').trim() || undefined
  const majorModelVersion =
    String(clip.major_model_version ?? studio.majorModelVersion ?? '').trim() || undefined
  const videoUrl = String(clip.video_url ?? '').trim() || undefined

  const deductChargedRaw = studio.deductCharged ?? clip.deduct_charged
  const deductCharged =
    deductChargedRaw != null && Number.isFinite(Number(deductChargedRaw))
      ? Number(deductChargedRaw)
      : undefined
  const chargeMultRaw = studio.chargeMult ?? clip.charge_mult
  const chargeMult =
    chargeMultRaw != null && Number.isFinite(Number(chargeMultRaw))
      ? Number(chargeMultRaw)
      : undefined
  const deductTypeRaw = studio.deductTypeSnapshot ?? clip.deduct_type_snapshot
  const deductTypeSnapshot =
    deductTypeRaw != null && Number.isFinite(Number(deductTypeRaw))
      ? Number(deductTypeRaw)
      : undefined

  const styleWeightRaw = studio.styleWeight
  const styleWeight =
    styleWeightRaw != null && Number.isFinite(Number(styleWeightRaw))
      ? Number(styleWeightRaw)
      : undefined
  const weirdnessRaw = studio.weirdnessConstraint
  const weirdnessConstraint =
    weirdnessRaw != null && Number.isFinite(Number(weirdnessRaw)) ? Number(weirdnessRaw) : undefined
  const audioWeightRaw = studio.audioWeight
  const audioWeight =
    audioWeightRaw != null && Number.isFinite(Number(audioWeightRaw))
      ? Number(audioWeightRaw)
      : undefined
  const vocalGenderRaw = String(studio.vocalGender ?? '').trim()
  const vocalGender: SunoVocalGender | undefined =
    vocalGenderRaw === 'f' || vocalGenderRaw === 'm' ? vocalGenderRaw : undefined

  const feedMeta = clip.metadata as Record<string, unknown> | undefined
  const feedSliders =
    feedMeta?.control_sliders && typeof feedMeta.control_sliders === 'object'
      ? (feedMeta.control_sliders as Record<string, unknown>)
      : undefined
  const styleFromFeed =
    feedSliders && typeof feedSliders.style_weight === 'number'
      ? feedSliders.style_weight
      : undefined
  const weirdFromFeed =
    feedSliders && typeof feedSliders.weirdness_constraint === 'number'
      ? feedSliders.weirdness_constraint
      : undefined
  const audioFromFeed =
    feedSliders && typeof feedSliders.audio_weight === 'number'
      ? feedSliders.audio_weight
      : undefined
  const vocalFromFeed = String(feedMeta?.vocal_gender ?? '').trim()
  const vocalFromFeedTyped: SunoVocalGender | undefined =
    vocalFromFeed === 'f' || vocalFromFeed === 'm' ? vocalFromFeed : undefined

  return {
    taskId,
    pollAnchorClipId,
    isUploadClip,
    parentClipId,
    stemGroupId,
    stemKind,
    midiState,
    serverJobId,
    modelKey,
    sunoMv,
    gptDescriptionPrompt,
    negativeTags,
    clipType,
    stemFromId,
    isRemix: isRemix || undefined,
    variantIndex,
    sunoModelName,
    majorModelVersion,
    videoUrl,
    deductCharged,
    chargeMult,
    deductTypeSnapshot,
    styleWeight: styleWeight ?? styleFromFeed,
    weirdnessConstraint: weirdnessConstraint ?? weirdFromFeed,
    vocalGender: vocalGender ?? vocalFromFeedTyped,
    audioWeight: audioWeight ?? audioFromFeed,
  }
}

export interface CloudMusicJobsPayload {
  list: Array<Record<string, unknown>>
  syncSeq: number
}

/** 从 /music/suno/jobs 响应中解析 list 与 syncSeq（兼容 Nest Result 与直接 data 对象） */
export function parseCloudMusicJobsResponse(res: unknown): CloudMusicJobsPayload {
  const body = unwrapMusicApiData<{
    list?: unknown
    syncSeq?: unknown
    data?: { list?: unknown; syncSeq?: unknown }
  }>(res)
  const nested =
    body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as { list?: unknown; syncSeq?: unknown })
      : null
  const raw = (res as { data?: { list?: unknown; syncSeq?: unknown } })?.data
  const list = Array.isArray(body?.list)
    ? body.list
    : Array.isArray(nested?.list)
      ? nested.list
      : Array.isArray(raw?.list)
        ? raw.list
        : []
  const syncSeq = Number(body?.syncSeq ?? nested?.syncSeq ?? raw?.syncSeq ?? 0)
  return { list, syncSeq }
}

export function mapCloudJobRowToClip(row: Record<string, unknown>): MusicClipItem | null {
  const clip = (row.clip as Record<string, unknown>) || {}
  const clipId = String(row.clipId || clip.id || '').trim()
  const ckRaw = row.clientKey != null ? String(row.clientKey).trim() : ''
  if (!clipId && !ckRaw) return null
  const ck = ckRaw || `srv-${row.id ?? clipId}`
  const serverJobId = row.id != null && Number.isFinite(Number(row.id)) ? Number(row.id) : undefined
  const studio = studioFieldsFromCloudClip(clip)
  const feedProvenance = mergeClipProvenanceFromFeed(clip as SunoFeedClip)
  const lyricsRaw = clip.prompt ?? (clip.metadata as Record<string, unknown> | undefined)?.prompt
  const pollAnchorClipId =
    studio.pollAnchorClipId || (ck.endsWith('-0') && clipId ? clipId : undefined)
  const audioUrl = clip.audio_url ? String(clip.audio_url) : undefined
  let status = String(row.status || 'submitted') as SunoTaskStatus
  const rowModelKey = String(row.modelKey ?? '').trim() || undefined
  const rowDeductCharged =
    row.deductCharged != null && Number.isFinite(Number(row.deductCharged))
      ? Number(row.deductCharged)
      : undefined
  const rowChargeMult =
    row.chargeMult != null && Number.isFinite(Number(row.chargeMult))
      ? Number(row.chargeMult)
      : undefined
  const rowDeductType =
    row.deductTypeSnapshot != null && Number.isFinite(Number(row.deductTypeSnapshot))
      ? Number(row.deductTypeSnapshot)
      : undefined
  const mapped = normalizeSunoPlaybackUrl({
    id: ck,
    clipId,
    title: String(row.promptLabel || ''),
    tags: clip.tags != null ? String(clip.tags) : undefined,
    status,
    audioUrl,
    imageUrl: clip.image_url ? String(clip.image_url) : undefined,
    duration: typeof clip.duration === 'number' && clip.duration > 0 ? clip.duration : undefined,
    lyricsText:
      lyricsRaw != null && String(lyricsRaw).trim() ? String(lyricsRaw).trim() : undefined,
    sceneLabel: row.sceneLabel ? String(row.sceneLabel) : undefined,
    createdAt: row.createdAt ? new Date(String(row.createdAt)).getTime() : Date.now(),
    ...studio,
    ...feedProvenance,
    modelKey: rowModelKey || studio.modelKey,
    deductCharged: rowDeductCharged ?? studio.deductCharged,
    chargeMult: rowChargeMult ?? studio.chargeMult,
    deductTypeSnapshot: rowDeductType ?? studio.deductTypeSnapshot,
    pollAnchorClipId,
    serverJobId: serverJobId ?? studio.serverJobId,
  })
  return mapped
}

export function mapCloudMusicJobsToClips(rows: Array<Record<string, unknown>>): MusicClipItem[] {
  return rows.map(row => mapCloudJobRowToClip(row)).filter((c): c is MusicClipItem => c != null)
}
