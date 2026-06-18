import type { MusicClipItem, SunoTaskStatus, SunoVocalGender } from '@/types/music'
import { SUNO_MV_SELECT_OPTIONS } from '@/types/music'
import { getStemsForSource } from '@/utils/sunoStemUtils'

export interface MusicModelLabelOption {
  model: string
  modelName: string
}

export interface MusicClipDetailRow {
  id: string
  labelKey: string
  value: string
  /** 若设置则展示 t(valueKey) 而非原始 value */
  valueKey?: string
  mono?: boolean
  copyable?: boolean
  href?: string
  empty?: boolean
}

export interface MusicClipDetailSection {
  id: string
  titleKey: string
  rows: MusicClipDetailRow[]
}

export interface MusicClipDetailView {
  clip: MusicClipItem
  sections: MusicClipDetailSection[]
  batchSiblings: MusicClipItem[]
  stemChildren: MusicClipItem[]
  sourceClip: MusicClipItem | null
  rawMetadataJson: string
}

const STATUS_LABEL_KEYS: Record<SunoTaskStatus, string> = {
  submitted: 'music.statusSubmitted',
  queued: 'music.statusQueued',
  streaming: 'music.statusStreaming',
  complete: 'music.statusComplete',
  error: 'music.statusError',
}

const VOCAL_GENDER_KEYS: Record<Exclude<SunoVocalGender, ''>, string> = {
  f: 'music.vocalGenderFemale',
  m: 'music.vocalGenderMale',
}

function row(
  id: string,
  labelKey: string,
  value: string | undefined | null,
  opts?: Partial<MusicClipDetailRow> & { force?: boolean }
): MusicClipDetailRow | null {
  const v = String(value ?? '').trim()
  if (!v && !opts?.empty && !opts?.force) return null
  const { force: _force, ...rest } = opts ?? {}
  return {
    id,
    labelKey,
    value: v || '—',
    empty: !v,
    ...rest,
  }
}

function rows(...items: (MusicClipDetailRow | null)[]): MusicClipDetailRow[] {
  return items.filter((r): r is MusicClipDetailRow => r != null)
}

function formatSlider(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return ''
  return v.toFixed(2)
}

export function formatMusicDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatMusicCreatedAt(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export function resolvePlatformModelLabel(
  modelKey: string | undefined,
  models?: MusicModelLabelOption[]
): string {
  const key = String(modelKey ?? '').trim()
  if (!key) return ''
  const hit = models?.find(m => m.model === key)
  if (hit?.modelName) return `${hit.modelName} (${key})`
  return key
}

export function resolveSunoMvValueKey(clip: MusicClipItem): string | undefined {
  if (clip.sunoMv) {
    return SUNO_MV_SELECT_OPTIONS.find(o => o.value === clip.sunoMv)?.labelKey
  }
  const name = String(clip.sunoModelName ?? '').trim()
  if (name) {
    return SUNO_MV_SELECT_OPTIONS.find(o => o.value === name)?.labelKey
  }
  return undefined
}

export function resolveSunoMvFallbackLabel(clip: MusicClipItem): string {
  const parts: string[] = []
  if (clip.sunoModelName) parts.push(clip.sunoModelName)
  if (clip.majorModelVersion) parts.push(clip.majorModelVersion)
  if (clip.sunoMv && !parts.includes(clip.sunoMv)) parts.unshift(clip.sunoMv)
  return parts.join(' · ')
}

export function inferClipSourceTypeKey(clip: MusicClipItem): string {
  if (clip.isUploadClip || clip.clipType?.toLowerCase().includes('upload')) {
    return 'music.detailSourceUpload'
  }
  if (clip.parentClipId || clip.stemKind || clip.stemFromId) {
    return 'music.detailSourceStem'
  }
  if (clip.isRemix) return 'music.detailSourceRemix'
  if (clip.sceneLabel?.includes('Cover') || clip.sceneLabel?.includes('翻唱')) {
    return 'music.detailSourceCover'
  }
  if (clip.sceneLabel?.includes('上传') || clip.sceneLabel?.includes('Upload')) {
    return 'music.detailSourceUpload'
  }
  return 'music.detailSourceGenerate'
}

export function findBatchSiblings(clip: MusicClipItem, all: MusicClipItem[]): MusicClipItem[] {
  if (!clip.createdAt || !clip.sceneLabel || clip.parentClipId) return []
  return all.filter(
    c =>
      c.id !== clip.id &&
      !c.parentClipId &&
      c.createdAt === clip.createdAt &&
      c.sceneLabel === clip.sceneLabel
  )
}

export function findRelatedSourceClip(
  clip: MusicClipItem,
  all: MusicClipItem[]
): MusicClipItem | null {
  const sourceId = String(clip.parentClipId || clip.stemFromId || '').trim()
  if (!sourceId) return null
  return all.find(c => c.clipId === sourceId && !c.parentClipId) ?? null
}

export function buildMusicClipDetail(
  clip: MusicClipItem,
  allClips: MusicClipItem[],
  models?: MusicModelLabelOption[]
): MusicClipDetailView {
  const batchSiblings = findBatchSiblings(clip, allClips)
  const stemChildren = clip.clipId ? getStemsForSource(allClips, clip.clipId) : []
  const sourceClip = findRelatedSourceClip(clip, allClips)
  const mvValueKey = resolveSunoMvValueKey(clip)

  const overview = rows(
    row('scene', 'music.detailScene', clip.sceneLabel),
    {
      id: 'source',
      labelKey: 'music.detailSourceType',
      value: '',
      valueKey: inferClipSourceTypeKey(clip),
    },
    {
      id: 'status',
      labelKey: 'music.detailStatus',
      value: '',
      valueKey: STATUS_LABEL_KEYS[clip.status] || 'music.statusSubmitted',
    },
    row('created', 'music.detailCreatedAt', formatMusicCreatedAt(clip.createdAt)),
    row('duration', 'music.detailDuration', formatMusicDuration(clip.duration)),
    row(
      'variant',
      'music.detailVariant',
      batchSiblings.length ? `${(clip.variantIndex ?? 0) + 1} / ${batchSiblings.length + 1}` : ''
    )
  )

  const modelsSection = rows(
    mvValueKey
      ? {
          id: 'musicModelVersion',
          labelKey: 'music.detailMusicModelVersion',
          value: '',
          valueKey: mvValueKey,
        }
      : row(
          'musicModelVersion',
          'music.detailMusicModelVersion',
          resolveSunoMvFallbackLabel(clip),
          {
            force: true,
          }
        ),
    row(
      'platformModel',
      'music.detailPlatformModel',
      resolvePlatformModelLabel(clip.modelKey, models),
      { force: true }
    ),
    row('sunoEngine', 'music.detailSunoEngine', clip.sunoModelName, { force: true }),
    row('majorVersion', 'music.detailMajorVersion', clip.majorModelVersion, { force: true })
  )

  const billing: MusicClipDetailRow[] = [
    {
      id: 'deductCharged',
      labelKey: 'music.detailDeductCharged',
      value:
        clip.deductCharged != null && Number.isFinite(clip.deductCharged)
          ? String(clip.deductCharged)
          : '—',
      empty: clip.deductCharged == null,
    },
    {
      id: 'chargeMult',
      labelKey: 'music.detailChargeMult',
      value:
        clip.chargeMult != null && Number.isFinite(clip.chargeMult)
          ? clip.chargeMult > 1
            ? `${clip.chargeMult}×`
            : '1×'
          : '—',
      empty: clip.chargeMult == null,
    },
  ]
  if (batchSiblings.length) {
    billing.push({
      id: 'billingNote',
      labelKey: 'music.detailBillingBatchNote',
      value: '',
      valueKey: 'music.detailBillingBatchNote',
    })
  }

  const advanced = rows(
    row('styleWeight', 'music.styleWeightLabel', formatSlider(clip.styleWeight), { force: true }),
    row('weirdness', 'music.weirdnessLabel', formatSlider(clip.weirdnessConstraint), {
      force: true,
    }),
    clip.vocalGender
      ? {
          id: 'vocalGender',
          labelKey: 'music.vocalGenderLabel',
          value: '',
          valueKey: VOCAL_GENDER_KEYS[clip.vocalGender as 'f' | 'm'],
        }
      : row('vocalGender', 'music.vocalGenderLabel', '', { force: true }),
    row('audioWeight', 'music.audioWeightLabel', formatSlider(clip.audioWeight), { force: true }),
    row('negativeTags', 'music.detailNegativeTags', clip.negativeTags, { force: true })
  )

  const creative = rows(
    row('title', 'music.detailTitle', clip.title),
    row('tags', 'music.detailTags', clip.tags),
    row('gpt', 'music.detailGptPrompt', clip.gptDescriptionPrompt),
    row('lyrics', 'music.detailLyrics', clip.lyricsText, { mono: true })
  )

  const technical = rows(
    row('clipId', 'music.detailClipId', clip.clipId, { mono: true, copyable: true }),
    row('taskId', 'music.detailTaskId', clip.taskId, { mono: true, copyable: true }),
    row('pollAnchor', 'music.detailPollAnchor', clip.pollAnchorClipId, {
      mono: true,
      copyable: true,
    }),
    row('localId', 'music.detailLocalId', clip.id, { mono: true, copyable: true }),
    row(
      'serverJob',
      'music.detailServerJobId',
      clip.serverJobId != null ? String(clip.serverJobId) : ''
    ),
    row('parentClip', 'music.detailParentClipId', clip.parentClipId, {
      mono: true,
      copyable: true,
    }),
    row('stemFrom', 'music.detailStemFromId', clip.stemFromId, { mono: true, copyable: true }),
    row('stemKind', 'music.detailStemKind', clip.stemKind),
    row('clipType', 'music.detailClipType', clip.clipType)
  )

  const media = rows(
    row('audio', 'music.detailAudioUrl', clip.audioUrl, {
      mono: true,
      copyable: true,
      href: clip.audioUrl,
    }),
    row('image', 'music.detailImageUrl', clip.imageUrl, {
      mono: true,
      copyable: true,
      href: clip.imageUrl,
    }),
    row('video', 'music.detailVideoUrl', clip.videoUrl, {
      mono: true,
      copyable: true,
      href: clip.videoUrl,
    })
  )

  const relations = rows(
    row(
      'siblings',
      'music.detailBatchSiblings',
      batchSiblings.map(s => s.title || s.clipId.slice(0, 8)).join(' · ')
    ),
    row(
      'stems',
      'music.detailStemChildren',
      stemChildren.map(s => s.title || s.stemKind || s.clipId.slice(0, 8)).join(' · ')
    )
  )

  const sections: MusicClipDetailSection[] = [
    { id: 'overview', titleKey: 'music.detailSectionOverview', rows: overview },
    { id: 'models', titleKey: 'music.detailSectionModels', rows: modelsSection },
  ]

  sections.push(
    { id: 'billing', titleKey: 'music.detailSectionBilling', rows: billing },
    { id: 'advanced', titleKey: 'music.detailSectionAdvanced', rows: advanced },
    { id: 'creative', titleKey: 'music.detailSectionCreative', rows: creative },
    { id: 'technical', titleKey: 'music.detailSectionTechnical', rows: technical },
    { id: 'media', titleKey: 'music.detailSectionMedia', rows: media }
  )

  if (relations.length) {
    sections.push({ id: 'relations', titleKey: 'music.detailSectionRelations', rows: relations })
  }

  const rawMetadataJson = JSON.stringify(
    {
      clipId: clip.clipId,
      sceneLabel: clip.sceneLabel,
      modelKey: clip.modelKey,
      sunoMv: clip.sunoMv,
      sunoModelName: clip.sunoModelName,
      majorModelVersion: clip.majorModelVersion,
      deductCharged: clip.deductCharged,
      chargeMult: clip.chargeMult,
      deductTypeSnapshot: clip.deductTypeSnapshot,
      styleWeight: clip.styleWeight,
      weirdnessConstraint: clip.weirdnessConstraint,
      vocalGender: clip.vocalGender,
      audioWeight: clip.audioWeight,
      status: clip.status,
      tags: clip.tags,
      negativeTags: clip.negativeTags,
      gptDescriptionPrompt: clip.gptDescriptionPrompt,
      lyricsText: clip.lyricsText,
      taskId: clip.taskId,
      pollAnchorClipId: clip.pollAnchorClipId,
      parentClipId: clip.parentClipId,
      stemFromId: clip.stemFromId,
      stemKind: clip.stemKind,
      clipType: clip.clipType,
      isUploadClip: clip.isUploadClip,
      isRemix: clip.isRemix,
      variantIndex: clip.variantIndex,
      audioUrl: clip.audioUrl,
      imageUrl: clip.imageUrl,
      videoUrl: clip.videoUrl,
      duration: clip.duration,
      createdAt: clip.createdAt,
      serverJobId: clip.serverJobId,
    },
    null,
    2
  )

  return { clip, sections, batchSiblings, stemChildren, sourceClip, rawMetadataJson }
}
