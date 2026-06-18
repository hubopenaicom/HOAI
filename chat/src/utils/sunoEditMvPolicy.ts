import type { MusicEditMode, SunoModelVersion } from '@/types/music'
import {
  SUNO_BLUEJAY_REQUIRED_EDIT_MODES,
  SUNO_DEFAULT_MODEL_VERSION,
  SUNO_MV_SELECT_OPTIONS,
  upgradeLegacyImplicitSunoMv,
} from '@/types/music'

/** 侧栏 Suno 模型版本 UI 行为 */
export type SunoEditMvUiMode = 'select' | 'locked' | 'hidden'

export interface SunoEditMvPolicy {
  uiMode: SunoEditMvUiMode
  /** 锁定时的固定 mv */
  lockedMv?: SunoModelVersion
  /** 可选版本（select / locked 时用于过滤下拉） */
  allowedMvs: readonly SunoModelVersion[]
  /** 说明文案 i18n key */
  hintKey: string
}

const ALL_MVS = SUNO_MV_SELECT_OPTIONS.map(o => o.value)

/** 文档：infill / cover / persona 等支持 fenix～v4，不含仅分离专用的限制 */
const STANDARD_EDIT_MVS: readonly SunoModelVersion[] = [
  'chirp-fenix',
  'chirp-crow',
  'chirp-bluejay',
  'chirp-auk-turbo',
  'chirp-auk',
  'chirp-v4',
]

const EDIT_MV_POLICIES: Record<MusicEditMode, SunoEditMvPolicy> = {
  extend: {
    uiMode: 'select',
    allowedMvs: ALL_MVS,
    hintKey: 'music.mvPolicyExtend',
  },
  reference: {
    uiMode: 'select',
    allowedMvs: ALL_MVS,
    hintKey: 'music.mvPolicyReference',
  },
  infill: {
    uiMode: 'select',
    allowedMvs: STANDARD_EDIT_MVS,
    hintKey: 'music.mvPolicyInfill',
  },
  rewrite: {
    uiMode: 'hidden',
    allowedMvs: ALL_MVS,
    hintKey: 'music.mvPolicyRewrite',
  },
  overpainting: {
    uiMode: 'locked',
    lockedMv: 'chirp-bluejay',
    allowedMvs: ['chirp-bluejay'],
    hintKey: 'music.mvPolicyBluejayRequired',
  },
  underpainting: {
    uiMode: 'locked',
    lockedMv: 'chirp-bluejay',
    allowedMvs: ['chirp-bluejay'],
    hintKey: 'music.mvPolicyBluejayRequired',
  },
  add_vocals: {
    uiMode: 'locked',
    lockedMv: 'chirp-bluejay',
    allowedMvs: ['chirp-bluejay'],
    hintKey: 'music.mvPolicyBluejayRequired',
  },
  persona_sing: {
    uiMode: 'select',
    allowedMvs: STANDARD_EDIT_MVS,
    hintKey: 'music.mvPolicyPersonaSing',
  },
  cover: {
    uiMode: 'select',
    allowedMvs: STANDARD_EDIT_MVS,
    hintKey: 'music.mvPolicyCover',
  },
}

export function getSunoEditMvPolicy(editMode: MusicEditMode): SunoEditMvPolicy {
  return EDIT_MV_POLICIES[editMode]
}

export function filterMvOptionsForEditMode(editMode: MusicEditMode) {
  const allowed = new Set(getSunoEditMvPolicy(editMode).allowedMvs)
  return SUNO_MV_SELECT_OPTIONS.filter(o => allowed.has(o.value))
}

/** 将 mv 规范到当前编辑场景允许的版本 */
export function coerceSunoMvForEditMode(
  editMode: MusicEditMode,
  mv: SunoModelVersion
): SunoModelVersion {
  const policy = getSunoEditMvPolicy(editMode)
  if (policy.uiMode === 'locked' && policy.lockedMv) {
    return policy.lockedMv
  }
  const upgraded = upgradeLegacyImplicitSunoMv(mv)
  if (policy.allowedMvs.includes(upgraded)) return upgraded
  return SUNO_DEFAULT_MODEL_VERSION
}

/**
 * 编辑区切换子场景时的 mv。
 * bluejay 专用场景锁定；从 bluejay 专用切出时回到 v5.5 默认。
 */
export function resolveSunoMvForEditMode(
  editMode: MusicEditMode,
  currentMv: SunoModelVersion,
  previousEditMode?: MusicEditMode
): SunoModelVersion {
  if (SUNO_BLUEJAY_REQUIRED_EDIT_MODES.includes(editMode)) {
    return 'chirp-bluejay'
  }
  if (previousEditMode && SUNO_BLUEJAY_REQUIRED_EDIT_MODES.includes(previousEditMode)) {
    return coerceSunoMvForEditMode(editMode, SUNO_DEFAULT_MODEL_VERSION)
  }
  return coerceSunoMvForEditMode(editMode, currentMv)
}
