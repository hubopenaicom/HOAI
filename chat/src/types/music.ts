/**
 * Suno mv 参数（doc/音乐/音乐版本以及生成参数介绍.md）
 * Cover / Persona 等场景另有 chirp-v4-tau 等，由 sunoPayloadAdapter 自动写入。
 */
export const SUNO_DEPRECATED_MODEL_VERSIONS = ['chirp-v3-5', 'chirp-v3.0'] as const

/** 当前可用版本（已剔除 v3.5 / v3.0 等下线版本） */
export const SUNO_MODEL_VERSIONS = [
  'chirp-fenix',
  'chirp-crow',
  'chirp-bluejay',
  'chirp-auk-turbo',
  'chirp-auk',
  'chirp-v4',
] as const

export type SunoModelVersion = (typeof SUNO_MODEL_VERSIONS)[number]

/** 全站默认：最新 Suno 模型版本 v5.5 */
export const SUNO_DEFAULT_MODEL_VERSION: SunoModelVersion = 'chirp-fenix'

/** 侧栏「Suno 模型版本」下拉（仅可用版本，最新在前） */
export const SUNO_MV_SELECT_OPTIONS: { value: SunoModelVersion; labelKey: string }[] = [
  { value: 'chirp-fenix', labelKey: 'music.mvFenix' },
  { value: 'chirp-crow', labelKey: 'music.mvCrow' },
  { value: 'chirp-bluejay', labelKey: 'music.mvBluejay' },
  { value: 'chirp-auk-turbo', labelKey: 'music.mvAukTurbo' },
  { value: 'chirp-auk', labelKey: 'music.mvAuk' },
  { value: 'chirp-v4', labelKey: 'music.mvV4' },
]

export function isSunoModelVersion(v: unknown): v is SunoModelVersion {
  return typeof v === 'string' && (SUNO_MODEL_VERSIONS as readonly string[]).includes(v)
}

/** 将 localStorage / 快照中的 mv 规范为可用版本（下线版本映射到默认最新） */
export function normalizeSunoModelVersion(v: unknown): SunoModelVersion {
  if (isSunoModelVersion(v)) return v
  if (typeof v === 'string' && (SUNO_DEPRECATED_MODEL_VERSIONS as readonly string[]).includes(v)) {
    return SUNO_DEFAULT_MODEL_VERSION
  }
  return SUNO_DEFAULT_MODEL_VERSION
}

/** 旧版隐式 4.5 默认（非用户主动选择 v5 / bluejay 等） */
export const SUNO_LEGACY_IMPLICIT_MVS = new Set<SunoModelVersion>(['chirp-auk', 'chirp-auk-turbo'])

export function upgradeLegacyImplicitSunoMv(mv: SunoModelVersion): SunoModelVersion {
  return SUNO_LEGACY_IMPLICIT_MVS.has(mv) ? SUNO_DEFAULT_MODEL_VERSION : mv
}

/** 侧栏主分区 */
export type MusicPrimaryTab = 'create' | 'edit' | 'process' | 'tools'

/** 创作类子场景（对应 /suno/generate 场景 1–4） */
export type MusicCreateMode = 'inspire' | 'custom' | 'instrumental_custom' | 'instrumental_inspire'

/** 处理类子场景（场景 8–9 + MIDI 工具链） */
export type MusicProcessMode = 'all_stems' | 'vocal_stems' | 'midi'

/** 工具区 */
export type MusicToolsMode = 'upload' | 'tags' | 'concat' | 'persona' | 'extend_concat'

/** 编辑：Persona 演唱（artist_consistency） */
export type MusicEditMode =
  | 'extend'
  | 'reference'
  | 'infill'
  | 'rewrite'
  | 'overpainting'
  | 'underpainting'
  | 'add_vocals'
  | 'persona_sing'
  | 'cover'

/** 须强制 chirp-bluejay 的编辑场景（Suno 场景 11 等） */
export const SUNO_BLUEJAY_REQUIRED_EDIT_MODES: MusicEditMode[] = [
  'overpainting',
  'add_vocals',
  'underpainting',
]

export type SunoVocalGender = '' | 'f' | 'm'

/** 任务状态（/suno/feed） */
export type SunoTaskStatus = 'submitted' | 'queued' | 'streaming' | 'complete' | 'error'

/** 分离音轨类型（用于展示与排序） */
export type MusicStemKind =
  | 'vocals'
  | 'instrumental'
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'piano'
  | 'other'

export type SunoMidiState = 'idle' | 'running' | 'complete' | 'error'

export interface MusicClipItem {
  id: string
  clipId: string
  title: string
  tags?: string
  status: SunoTaskStatus
  audioUrl?: string
  imageUrl?: string
  duration?: number
  /** 上游任务 id（续写/Cover/分离等 doc-1 场景） */
  taskId?: string
  /** ephone 双变体：generate 返回的占位 clip_id，feed 需用它才能拉回两首成品 */
  pollAnchorClipId?: string
  /** 是否为上传来源音频 */
  isUploadClip?: boolean
  /** 歌词全文（metadata.prompt 或创作时写入） */
  lyricsText?: string
  /** 展示用：来源场景标签 */
  sceneLabel?: string
  createdAt: number
  /** 声曲分离：源曲 clip_id（有值则不在主列表展示，仅在源曲弹窗中） */
  parentClipId?: string
  /** 同一次分离任务的本地分组 id */
  stemGroupId?: string
  /** 分离音轨类型 */
  stemKind?: MusicStemKind
  /** MIDI 获取状态与缓存数据 */
  midiState?: SunoMidiState
  midiData?: unknown
  /** 云端任务表主键（用于删除同步） */
  serverJobId?: number
  /** 管理后台配置的音乐 API 模型 key */
  modelKey?: string
  /** 提交时选择的 Suno mv（chirp-fenix 等） */
  sunoMv?: SunoModelVersion
  /** feed 返回的 model_name */
  sunoModelName?: string
  /** feed 返回的 major_model_version（如 v5.5） */
  majorModelVersion?: string
  /** 灵感模式 GPT 描述 */
  gptDescriptionPrompt?: string
  /** feed metadata.negative_tags */
  negativeTags?: string
  /** feed metadata.type（gen / stem / upload 等） */
  clipType?: string
  /** MV 视频地址 */
  videoUrl?: string
  /** 分离来源 clip_id */
  stemFromId?: string
  /** 是否为 remix */
  isRemix?: boolean
  /** 双变体批次内序号（0 起） */
  variantIndex?: number
  /** 本次扣费积分（快照） */
  deductCharged?: number
  /** 扣费倍数（双变体 / 全轨分离等） */
  chargeMult?: number
  /** 扣费类型快照（1 普通 / 2 高级 / 3 绘画） */
  deductTypeSnapshot?: number
  /** 高阶参数 style_weight */
  styleWeight?: number | null
  /** 高阶参数 weirdness_constraint */
  weirdnessConstraint?: number | null
  /** 高阶参数 vocal_gender */
  vocalGender?: SunoVocalGender
  /** Cover audio_weight */
  audioWeight?: number | null
}

/** 侧栏表单快照（供后续对接 generate API） */
export interface MusicFormState {
  primaryTab: MusicPrimaryTab
  createMode: MusicCreateMode
  editMode: MusicEditMode
  processMode: MusicProcessMode
  toolsMode: MusicToolsMode
  mv: SunoModelVersion
  title: string
  tags: string
  prompt: string
  gptDescriptionPrompt: string
  makeInstrumental: boolean
  /** 续写/替换等：目标 clip */
  targetClipId: string
  continueAt: number | null
  infillStartS: number | null
  infillEndS: number | null
  overpaintingStartS: number | null
  overpaintingEndS: number | null
  underpaintingStartS: number | null
  underpaintingEndS: number | null
  /** 上传音频续写/混音/替换时需 task */
  sourceIsUpload: boolean
  /** 工具区：URL 上传 */
  uploadAudioUrl: string
  /** 高阶参数（场景十/十三） */
  negativeTags: string
  styleWeight: number | null
  weirdnessConstraint: number | null
  vocalGender: SunoVocalGender
  /** 拼接：续写后的 clip_id */
  concatClipId: string
  concatIsInfill: boolean
  /** Persona 创建 */
  personaName: string
  personaDescription: string
  personaRootClipId: string
  personaIsPublic: boolean
  /** Persona 演唱 / artist_consistency */
  personaId: string
  artistClipId: string
  /** Cover：原曲权重 0–1（metadata.control_sliders.audio_weight） */
  audioWeight: number | null
  /**
   * 人声创作：先调用歌词 API 再成曲（场景 2）。
   * 灵感模式开启时，成曲使用自定义 payload（prompt/tags/title）。
   */
  useLyricsFirst: boolean
}
