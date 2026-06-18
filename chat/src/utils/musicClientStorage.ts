import {
  SUNO_DEFAULT_MODEL_VERSION,
  SUNO_LEGACY_IMPLICIT_MVS,
  normalizeSunoModelVersion,
  upgradeLegacyImplicitSunoMv,
  type MusicClipItem,
  type MusicFormState,
  type SunoModelVersion,
} from '@/types/music'

/** 音乐页：上次选择的 Suno 模型 key（后台 models.model） */
export const STORAGE_KEY_MUSIC_SELECTED_MODEL = 'hoai_music_selected_model'
/** 音乐页：上次选择的模型版本 */
export const STORAGE_KEY_MUSIC_SELECTED_MV = 'hoai_music_selected_mv'
/** 已将旧版隐式默认 mv（chirp-auk）迁移到最新版 */
export const STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED = 'hoai_music_mv_legacy_default_migrated_v1'
/** 音乐页：上次主功能区（创作/编辑/处理/工具） */
export const STORAGE_KEY_MUSIC_PRIMARY_TAB = 'hoai_music_primary_tab'
/** 上次创建的 Persona ID（可选复用） */
export const STORAGE_KEY_MUSIC_PERSONA_ID = 'hoai_music_persona_id'

/** 绘画 ↔ 音乐 切换时：session 内音乐工作台快照 */
export const SESSION_KEY_MUSIC_STUDIO_SNAPSHOT = 'hoai_music_studio_snapshot'
/** 从绘画进入音乐时恢复快照 */
export const SESSION_KEY_RESTORE_MUSIC_STUDIO = 'hoai_restore_music_studio'

/** 音乐任务列表本地缓存（刷新后恢复，按用户分桶） */
export const STORAGE_KEY_MUSIC_CLIPS_CACHE = 'hoai_music_clips_cache_v1'

const MUSIC_SNAPSHOT_CLIP_CAP = 50
const MUSIC_CLIPS_CACHE_CAP = 80

export interface MusicStudioSnapshot {
  form: MusicFormState
  selectedModelKey: string
  activeClipId?: string
  playingClipId?: string
  clips: MusicClipItem[]
  savedAt: number
}

export function saveMusicStudioSnapshot(data: Omit<MusicStudioSnapshot, 'savedAt'>): void {
  try {
    const snap: MusicStudioSnapshot = {
      ...data,
      clips: data.clips.slice(0, MUSIC_SNAPSHOT_CLIP_CAP),
      savedAt: Date.now(),
    }
    sessionStorage.setItem(SESSION_KEY_MUSIC_STUDIO_SNAPSHOT, JSON.stringify(snap))
  } catch {
    /* ignore */
  }
}

export function loadMusicStudioSnapshot(): MusicStudioSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_MUSIC_STUDIO_SNAPSHOT)
    if (!raw) return null
    const o = JSON.parse(raw) as MusicStudioSnapshot
    if (!o || typeof o !== 'object' || !o.form) return null
    return o
  } catch {
    return null
  }
}

export function shouldRestoreMusicStudio(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY_RESTORE_MUSIC_STUDIO) === '1'
  } catch {
    return false
  }
}

export function clearRestoreMusicStudioFlag(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY_RESTORE_MUSIC_STUDIO)
  } catch {
    /* ignore */
  }
}

export function markRestoreMusicStudio(): void {
  try {
    sessionStorage.setItem(SESSION_KEY_RESTORE_MUSIC_STUDIO, '1')
  } catch {
    /* ignore */
  }
}

export function musicClipsCacheKey(userId?: number | string | null): string {
  const uid = userId != null ? String(userId).trim() : ''
  return uid ? `${STORAGE_KEY_MUSIC_CLIPS_CACHE}_${uid}` : STORAGE_KEY_MUSIC_CLIPS_CACHE
}

function readClipsCacheByKey(key: string): MusicClipItem[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const o = JSON.parse(raw) as { clips?: MusicClipItem[] }
    return Array.isArray(o?.clips) ? o.clips : []
  } catch {
    return []
  }
}

function readNewestScopedClipsCache(): MusicClipItem[] {
  let bestKey = ''
  let bestSavedAt = 0
  let bestLen = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(`${STORAGE_KEY_MUSIC_CLIPS_CACHE}_`)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const o = JSON.parse(raw) as { clips?: MusicClipItem[]; savedAt?: number }
      const len = Array.isArray(o?.clips) ? o.clips.length : 0
      if (!len) continue
      const savedAt = Number(o?.savedAt) || 0
      if (savedAt > bestSavedAt || (savedAt === bestSavedAt && len > bestLen)) {
        bestSavedAt = savedAt
        bestLen = len
        bestKey = key
      }
    }
  } catch {
    /* ignore */
  }
  return bestKey ? readClipsCacheByKey(bestKey) : []
}

export function loadMusicClipsCache(userId?: number | string | null): MusicClipItem[] {
  const uid = userId != null ? String(userId).trim() : ''
  if (uid) {
    const scoped = readClipsCacheByKey(musicClipsCacheKey(uid))
    if (scoped.length) return scoped
  }
  const fallback = readClipsCacheByKey(STORAGE_KEY_MUSIC_CLIPS_CACHE)
  if (fallback.length) return fallback
  return readNewestScopedClipsCache()
}

export function saveMusicClipsCache(clips: MusicClipItem[], userId?: number | string | null): void {
  if (!clips.length) return
  try {
    localStorage.setItem(
      musicClipsCacheKey(userId),
      JSON.stringify({
        clips: clips.slice(0, MUSIC_CLIPS_CACHE_CAP),
        savedAt: Date.now(),
      })
    )
  } catch {
    /* ignore */
  }
}

export function clearMusicClipsCache(userId?: number | string | null): void {
  try {
    localStorage.removeItem(musicClipsCacheKey(userId))
    if (userId == null) localStorage.removeItem(STORAGE_KEY_MUSIC_CLIPS_CACHE)
  } catch {
    /* ignore */
  }
}

const MV_MIGRATION_VERSION = '2'

/**
 * 读取侧栏 Suno 模型版本：无记录或仍为旧隐式默认时升级为 chirp-fenix (v5.5)。
 */
export function loadStoredSunoMv(): SunoModelVersion {
  try {
    const migratedVer = localStorage.getItem(STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED)
    const raw = localStorage.getItem(STORAGE_KEY_MUSIC_SELECTED_MV)

    if (migratedVer !== MV_MIGRATION_VERSION) {
      if (raw == null || raw === '' || (SUNO_LEGACY_IMPLICIT_MVS as Set<string>).has(raw)) {
        localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MV, SUNO_DEFAULT_MODEL_VERSION)
        localStorage.setItem(STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED, MV_MIGRATION_VERSION)
        return SUNO_DEFAULT_MODEL_VERSION
      }
      localStorage.setItem(STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED, MV_MIGRATION_VERSION)
    }

    return upgradeLegacyImplicitSunoMv(normalizeSunoModelVersion(raw))
  } catch {
    return SUNO_DEFAULT_MODEL_VERSION
  }
}
