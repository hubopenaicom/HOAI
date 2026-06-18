export type SunoLyricsPollStatus = 'pending' | 'complete' | 'error'

export interface SunoLyricsPollResult {
  taskId: string
  text: string
  title: string
  status: SunoLyricsPollStatus
  failReason?: string
}

function unwrapSunoBody(data: unknown): unknown {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return data
  const o = data as Record<string, unknown>
  const code = String(o.code ?? '').toLowerCase()
  if ((code === 'success' || code === 'ok') && o.data !== undefined) return o.data
  return data
}

function isLikelyTaskId(value: string): boolean {
  const t = value.trim()
  if (!t || t.length > 80 || /\s/.test(t) || t.includes('<')) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t))
    return true
  return t.length >= 8 && t.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(t)
}

export function parseLyricsSubmitTaskId(data: unknown): string {
  const unwrapped = unwrapSunoBody(data)
  if (typeof unwrapped === 'string' && isLikelyTaskId(unwrapped)) return unwrapped.trim()
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return ''
  const o = unwrapped as Record<string, unknown>
  return String(o.task_id ?? o.id ?? '').trim()
}

/** 解析 GET lyrics/fetch 或后端 normalize 后的 body */
export function parseLyricsPollResult(data: unknown): SunoLyricsPollResult {
  const unwrapped = unwrapSunoBody(data)
  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    const o = unwrapped as Record<string, unknown>
    if (o.status === 'pending' || o.status === 'complete' || o.status === 'error') {
      return {
        taskId: String(o.task_id ?? '').trim(),
        text: String(o.text ?? '').trim(),
        title: String(o.title ?? '').trim(),
        status: o.status as SunoLyricsPollStatus,
        failReason: o.fail_reason != null ? String(o.fail_reason) : undefined,
      }
    }
  }
  return parseLyricsFromRawFetch(unwrapped)
}

function parseLyricsFromRawFetch(data: unknown): SunoLyricsPollResult {
  const empty: SunoLyricsPollResult = { taskId: '', text: '', title: '', status: 'pending' }
  let task: Record<string, unknown> | null = null
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0]
    if (first && typeof first === 'object') task = first as Record<string, unknown>
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    task = data as Record<string, unknown>
  }
  if (!task) return empty

  const taskId = String(task.task_id ?? task.id ?? '').trim()
  const fail = String(task.fail_reason ?? '').trim()
  const stRaw = String(task.status ?? task.state ?? '')
    .trim()
    .toUpperCase()

  if (stRaw === 'FAILURE' || stRaw === 'FAILED' || stRaw === 'ERROR' || fail) {
    return {
      taskId,
      text: '',
      title: '',
      status: 'error',
      failReason: fail || stRaw || '歌词任务失败',
    }
  }

  const inner = task.data
  let lyricBlock: Record<string, unknown> | null = null
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    lyricBlock = inner as Record<string, unknown>
  }

  const text = String(lyricBlock?.text ?? task.text ?? '').trim()
  const title = String(lyricBlock?.title ?? task.title ?? '').trim()
  const innerSt = String(lyricBlock?.status ?? '').toLowerCase()

  const done =
    stRaw === 'SUCCESS' ||
    stRaw === 'SUCCEEDED' ||
    stRaw === 'COMPLETE' ||
    stRaw === 'COMPLETED' ||
    innerSt === 'complete' ||
    innerSt === 'completed' ||
    innerSt === 'success'

  if (done && text) return { taskId, text, title, status: 'complete' }
  return { taskId, text, title, status: 'pending' }
}
