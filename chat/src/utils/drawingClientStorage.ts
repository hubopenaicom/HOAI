/**
 * 绘画相关浏览器缓存（sessionStorage / localStorage）。
 * 登出、token 失效、换账号时需清空，避免沿用上一用户的绑定对话组、MJ 任务缓存与偏好。
 */

/** 对话 → 绘画/音乐工作室前记住的对话组 id（router 守卫） */
export const STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING = 'hoai_prev_chat_group_before_drawing'
/** @deprecated 与绘画共用同一 session 键；保留别名便于阅读 */
export const STORAGE_KEY_PREV_CHAT_BEFORE_MUSIC = STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING

/** 绘画会话绑定的对话组 id（避免重复新建对话） */
export const STORAGE_KEY_DRAWING_BIND_GROUP = 'hoai_drawing_bind_group'

/** 上次在绘画页选中的模型 model 字段（刷新后恢复 MJ / 通用绘画布局，避免闪屏） */
export const STORAGE_KEY_DRAWING_SELECTED_MODEL = 'hoai_drawing_selected_model'

/** 音乐 ↔ 绘画 切换时：session 内绘画工作台快照 */
export const SESSION_KEY_DRAWING_STUDIO_SNAPSHOT = 'hoai_drawing_studio_snapshot'
export const SESSION_KEY_RESTORE_DRAWING_STUDIO = 'hoai_restore_drawing_studio'

export interface DrawingStudioSnapshot {
  selectedModelKey: string
  studioTab?: string
  savedAt: number
}

export function saveDrawingStudioSnapshot(data: Omit<DrawingStudioSnapshot, 'savedAt'>): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY_DRAWING_STUDIO_SNAPSHOT,
      JSON.stringify({ ...data, savedAt: Date.now() })
    )
  } catch {
    /* ignore */
  }
}

export function loadDrawingStudioSnapshot(): DrawingStudioSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_DRAWING_STUDIO_SNAPSHOT)
    if (!raw) return null
    return JSON.parse(raw) as DrawingStudioSnapshot
  } catch {
    return null
  }
}

export function shouldRestoreDrawingStudio(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY_RESTORE_DRAWING_STUDIO) === '1'
  } catch {
    return false
  }
}

export function clearRestoreDrawingStudioFlag(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY_RESTORE_DRAWING_STUDIO)
  } catch {
    /* ignore */
  }
}

export function markRestoreDrawingStudio(): void {
  try {
    sessionStorage.setItem(SESSION_KEY_RESTORE_DRAWING_STUDIO, '1')
  } catch {
    /* ignore */
  }
}

const DRAWING_LOCAL_FIXED_KEYS = [
  'hoai_drawing_selected_model',
  'hoai_drawing_mj_custom_params_only',
  'hoai_drawing_mj_realistic_version',
  'hoai_drawing_mj_niji_version',
  'hoai_drawing_mj_seed',
] as const

/** localStorage 中按用户区分的 MJ 任务列表前缀：hoai_drawing_mj_jobs_v${ver}_${uid} */
const MJ_JOBS_LOCAL_PREFIX = 'hoai_drawing_mj_jobs_v'

/**
 * 清空绘画相关的 sessionStorage 与 localStorage（不改其它业务键）。
 * 幂等，可多次调用。
 */
/** 音乐页 localStorage 前缀 */
const MUSIC_LOCAL_PREFIX = 'hoai_music_'

export function clearMusicClientStorage(): void {
  try {
    localStorage.removeItem('hoai_music_selected_model')
    localStorage.removeItem('hoai_music_selected_mv')
    localStorage.removeItem('hoai_music_primary_tab')
    localStorage.removeItem('hoai_music_persona_id')
  } catch {
    /* ignore */
  }
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(MUSIC_LOCAL_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function clearDrawingClientStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY_DRAWING_BIND_GROUP)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(SESSION_KEY_DRAWING_STUDIO_SNAPSHOT)
    sessionStorage.removeItem(SESSION_KEY_RESTORE_DRAWING_STUDIO)
    sessionStorage.removeItem('hoai_music_studio_snapshot')
    sessionStorage.removeItem('hoai_restore_music_studio')
  } catch {
    /* ignore */
  }

  for (const k of DRAWING_LOCAL_FIXED_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }

  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(MJ_JOBS_LOCAL_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  clearMusicClientStorage()
}
