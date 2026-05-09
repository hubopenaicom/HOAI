/**
 * 绘画相关浏览器缓存（sessionStorage / localStorage）。
 * 登出、token 失效、换账号时需清空，避免沿用上一用户的绑定对话组、MJ 任务缓存与偏好。
 */

/** 对话 → 绘画前记住的对话组 id（router 守卫） */
export const STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING = 'hoai_prev_chat_group_before_drawing'

/** 绘画会话绑定的对话组 id（避免重复新建对话） */
export const STORAGE_KEY_DRAWING_BIND_GROUP = 'hoai_drawing_bind_group'

const DRAWING_LOCAL_FIXED_KEYS = [
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
}
