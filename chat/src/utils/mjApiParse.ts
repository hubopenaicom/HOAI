/** 解析 Nest Result + MJ 上游嵌套结构 */
export function parseMjSubmitBody(r: any): {
  ok: boolean
  mj?: {
    code?: number | string
    result?: string | number
    description?: string
    properties?: unknown
  }
  message?: string
} {
  if (!r) return { ok: false, message: 'empty' }
  if (r.success === false) return { ok: false, message: r.message || 'request failed' }
  let inner = r.data
  if (inner && typeof inner === 'object') {
    const anyInner = inner as Record<string, unknown>
    if (
      anyInner.data &&
      typeof anyInner.data === 'object' &&
      typeof anyInner.code === 'undefined' &&
      typeof (anyInner.data as any).code !== 'undefined'
    ) {
      inner = anyInner.data
    }
  }
  // { code, data: { result | taskId } } 且外层无 result — 解包时保留外层 code/description，否则会导致 applyMjSubmitResponse 误判失败（局部重绘 modal 等）
  if (inner && typeof inner === 'object') {
    const I = inner as Record<string, unknown>
    const nested = I.data
    if (
      nested &&
      typeof nested === 'object' &&
      !Array.isArray(nested) &&
      typeof I.result === 'undefined' &&
      ((nested as Record<string, unknown>).result !== undefined ||
        (nested as Record<string, unknown>).taskId !== undefined ||
        (nested as Record<string, unknown>).task_id !== undefined)
    ) {
      const n = nested as Record<string, unknown>
      inner = {
        ...n,
        code: n.code !== undefined ? n.code : I.code,
        description: n.description !== undefined ? n.description : I.description,
      } as typeof inner
    }
  }
  return { ok: true, mj: inner as any }
}

/** 上游 submit 返回的 code 可能是字符串 "1" */
export function normalizeMjSubmitCode(code: unknown): number | undefined {
  if (code === null || code === undefined) return undefined
  if (typeof code === 'number' && Number.isFinite(code)) return code
  if (typeof code === 'string' && code.trim() !== '') {
    const n = Number(code.trim())
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/** Imagine 提交成功码（与后端 withBalance 一致；0 为部分国内代理业务成功码） */
export function isMjSubmitAcceptedCode(code: unknown): boolean {
  const n = normalizeMjSubmitCode(code)
  return n === 0 || n === 1 || n === 21 || n === 22
}

function mjPickTaskIdPrimitive(v: unknown): string {
  if (v == null || typeof v === 'object') return ''
  const s = String(v).trim()
  return s || ''
}

/**
 * 从 submit/action、submit/imagine 等上游返回体提取用于轮询的任务 ID。
 * 兼容 midjourney-proxy-plus / 聚合网关多种字段名与一层嵌套。
 */
export function extractMjTaskId(
  mj: { result?: string | number; properties?: any } | undefined
): string {
  if (!mj) return ''
  const anyMj = mj as Record<string, unknown>
  const props = mj.properties as Record<string, unknown> | undefined

  const dataVal = anyMj.data
  if (typeof dataVal === 'string' && dataVal.trim()) return dataVal.trim()
  if (dataVal && typeof dataVal === 'object' && !Array.isArray(dataVal)) {
    const d = dataVal as Record<string, unknown>
    const nested = d.result ?? d.taskId ?? d.task_id ?? d.id ?? d.hash ?? d.jobId ?? d.recordId
    const ns = mjPickTaskIdPrimitive(nested)
    if (ns) return ns
    const innerData = d.data
    if (innerData && typeof innerData === 'object' && !Array.isArray(innerData)) {
      const id = mjPickTaskIdPrimitive(
        (innerData as Record<string, unknown>).taskId ??
          (innerData as Record<string, unknown>).task_id ??
          (innerData as Record<string, unknown>).id ??
          (innerData as Record<string, unknown>).result
      )
      if (id) return id
    }
  }

  const rawResult = mj.result
  if (rawResult != null && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
    const ro = rawResult as Record<string, unknown>
    const nid = ro.id ?? ro.taskId ?? ro.task_id ?? ro.hash ?? ro.result
    const ns = mjPickTaskIdPrimitive(nid)
    if (ns) return ns
  }

  const primResult =
    typeof rawResult === 'string' || typeof rawResult === 'number' ? rawResult : undefined
  const fromTop =
    mjPickTaskIdPrimitive(primResult) ||
    mjPickTaskIdPrimitive(anyMj.taskId) ||
    mjPickTaskIdPrimitive(anyMj.task_id) ||
    mjPickTaskIdPrimitive(anyMj.jobId) ||
    mjPickTaskIdPrimitive(anyMj.id)
  if (fromTop) return fromTop

  const propNested = props?.data
  if (propNested && typeof propNested === 'object' && !Array.isArray(propNested)) {
    const pn = propNested as Record<string, unknown>
    const pid =
      mjPickTaskIdPrimitive(pn.taskId) ||
      mjPickTaskIdPrimitive(pn.task_id) ||
      mjPickTaskIdPrimitive(pn.id) ||
      mjPickTaskIdPrimitive(pn.result)
    if (pid) return pid
  }

  const r =
    mjPickTaskIdPrimitive(props?.result) ??
    mjPickTaskIdPrimitive(props?.taskId) ??
    mjPickTaskIdPrimitive(props?.id) ??
    mjPickTaskIdPrimitive(props?.hash)
  return r || ''
}

/** 任务轮询接口返回 success:false 时的可读说明 */
export function nestResultErrorMessage(r: unknown): string | undefined {
  if (!r || typeof r !== 'object') return undefined
  const o = r as Record<string, unknown>
  if (o.success === false && o.message != null) return String(o.message)
  const d = o.data
  if (d && typeof d === 'object') {
    const inner = d as Record<string, unknown>
    if (inner.success === false) {
      const m = inner.msg ?? inner.message ?? inner.description
      if (m != null) return String(m)
    }
  }
  return undefined
}

function coerceFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim())
    if (!Number.isNaN(n) && Number.isFinite(n)) return n
  }
  return undefined
}

/** 国内常见 MJ 代理：status 为 1–5（等待/绘制中/完成/失败/超时），见服务端 MidjourneyStatusEnum */
function classifyMjNumericStatus(n: number): 'running' | 'success' | 'fail' | 'unknown' {
  if (n === 1 || n === 2) return 'running'
  if (n === 3) return 'success'
  if (n === 4 || n === 5) return 'fail'
  return 'unknown'
}

/**
 * 单次轮询解析结果：running | 完成成功 | 完成失败
 */

/** 收集任务里可展示的 HTTP(S) 图片地址（含四宫格 / 多 URL） */
export function collectMjImageUrls(task: Record<string, unknown> | undefined): string[] {
  if (!task) return []
  const out: string[] = []
  const seen = new Set<string>()
  const add = (u: unknown) => {
    if (typeof u !== 'string') return
    const s = u.trim()
    if (!/^https?:\/\//i.test(s) || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  add(task.imageUrl)
  add(task.image_url)
  add(task.cdnImage)
  add(task.picUrl)
  add(task.pic_url)
  add(task.discordImageUrl)
  add(task.previewUrl)
  add(task.preview_url)
  add(task.thumbnailUrl)
  add(task.thumbnail_url)
  add(task.tempImageUrl)
  add(task.progressImageUrl)
  add(task.coverUrl)
  const props = task.properties as Record<string, unknown> | undefined
  if (props) {
    add(props.imageUrl)
    add(props.image_url)
    add(props.cdnImage)
    add(props.previewUrl)
    add(props.preview_url)
    add(props.thumbnailUrl)
    add(props.thumbnail_url)
  }
  const list = task.imageUrls ?? task.image_urls ?? props?.imageUrls ?? props?.image_urls
  if (Array.isArray(list)) list.forEach(add)
  return out
}

/** 解析进度 0–100，用于进度条 */
export function parseMjProgressPercent(task: Record<string, unknown> | undefined): number | null {
  if (!task) return null
  const p =
    task.progress ??
    task.Progress ??
    task.percent ??
    (task as Record<string, unknown>).percentage ??
    task.currentProgress ??
    task.progressPercent ??
    (task as Record<string, unknown>).ProgressPercent ??
    task.taskProgress
  if (typeof p === 'number' && Number.isFinite(p)) return Math.min(100, Math.max(0, Math.round(p)))
  if (typeof p === 'string') {
    const mq = p.match(/(\d+(?:\.\d+)?)\s*%/)
    if (mq) return Math.min(100, Math.max(0, Math.round(parseFloat(mq[1]))))
    const n = parseFloat(p.trim())
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return Math.round(n)
  }
  return null
}

export type MjRunningPhaseKey = 'submitting' | 'queue' | 'drawing' | 'unknown'

/** 生成中阶段的粗粒度状态（用于文案） */
export function inferMjRunningPhase(task: Record<string, unknown> | undefined): MjRunningPhaseKey {
  if (!task) return 'submitting'
  const statusRaw = task.status ?? task.state ?? (task as Record<string, unknown>).taskStatus
  const num = coerceFiniteNumber(statusRaw)
  if (num === 1) return 'queue'
  if (num === 2) return 'drawing'
  const pct = parseMjProgressPercent(task)
  if (pct != null && pct > 0) return 'drawing'
  const st = normalizeMjStatus(statusRaw)
  if (['QUEUED', 'QUEUE', 'PENDING', 'WAITING', 'SUBMITTED'].includes(st)) return 'queue'
  if (['IN_PROGRESS', 'PROGRESS', 'RUNNING', 'WORKING'].includes(st)) return 'drawing'
  const desc = String(task.description ?? task.failReason ?? '').toLowerCase()
  if (desc.includes('queue') || desc.includes('wait')) return 'queue'
  return 'unknown'
}

function firstMjImageUrl(task: Record<string, unknown>): string | undefined {
  const all = collectMjImageUrls(task)
  return all[0]
}

/** 轮询失败文案：映射为可操作的 i18n key（原始串仍可从 task.failReason 查看） */
export type MjTaskFailureHintKey = 'drawing.mjFailModalWindow' | 'drawing.mjFailModalInvalid' | null

export function mjTaskFailureHintKey(raw: string | undefined): MjTaskFailureHintKey {
  const r = String(raw ?? '')
  if (!r.trim()) return null
  if (/invalid\s*parameter|无效参数|\[invalid/i.test(r)) return 'drawing.mjFailModalInvalid'
  if (/waiting\s*for\s*window\s*confirm|窗口等待|等待.*确认/i.test(r))
    return 'drawing.mjFailModalWindow'
  return null
}

/**
 * api.ephone.ai 等：任务结束同时带 description=Waiting for window confirm 与 failReason=无效参数，
 * 若只读 failReason 会误判为「蒙版/参数格式错」，实为 Discord 弹窗未关单。
 */
export function mjTaskFailureHintKeyFromTask(task: Record<string, unknown>): MjTaskFailureHintKey {
  const fr = String(task.failReason ?? task.failMsg ?? '').trim()
  const desc = String(task.description ?? '').trim()
  const win = /waiting\s*for\s*window\s*confirm/i.test(desc)
  const genericInvalid =
    fr === '无效参数' ||
    /^invalid\s*parameter\.?$/i.test(fr) ||
    /^\[invalid\s*parameter\]/i.test(fr)
  if (win && (genericInvalid || !fr)) return 'drawing.mjFailModalWindow'
  if (genericInvalid || /invalid\s*parameter|\[invalid/i.test(fr))
    return 'drawing.mjFailModalInvalid'
  if (/waiting\s*for\s*window\s*confirm|窗口等待/i.test(desc)) return 'drawing.mjFailModalWindow'
  return null
}

/** 合并 description + failReason，避免聚合把「等弹窗」误标成无效参数时误导用户 */
function mjTaskFailureDisplayMessage(task: Record<string, unknown>, fallback: string): string {
  const fr = String(task.failReason ?? task.failMsg ?? '').trim()
  const desc = String(task.description ?? '').trim()
  const win = /waiting\s*for\s*window\s*confirm/i.test(desc)
  const genericInvalid =
    fr === '无效参数' ||
    /^invalid\s*parameter\.?$/i.test(fr) ||
    /^\[invalid\s*parameter\]/i.test(fr)
  if (win && genericInvalid) return desc || fr || fallback
  if (win && fr && !genericInvalid) return `${desc} | ${fr}`
  return fr || desc || String(task.error ?? task.message ?? '').trim() || fallback
}

export function mjTaskPollOutcome(task: Record<string, unknown>): {
  phase: 'running' | 'done_ok' | 'done_fail'
  message?: string
} {
  const statusRaw = task.status ?? task.state ?? (task as any).taskStatus ?? (task as any).Status
  const num = coerceFiniteNumber(statusRaw)

  if (num !== undefined && num >= 1 && num <= 5) {
    const c = classifyMjNumericStatus(num)
    if (c === 'running') return { phase: 'running' }
    if (c === 'success') return { phase: 'done_ok' }
    if (c === 'fail') {
      return {
        phase: 'done_fail',
        message: mjTaskFailureDisplayMessage(task, num === 5 ? 'timeout' : 'FAILURE'),
      }
    }
  }

  const st = normalizeMjStatus(statusRaw)
  if (!st) {
    const img = firstMjImageUrl(task)
    if (img) return { phase: 'done_ok' }
    return { phase: 'running' }
  }

  if (!isMjTerminalStatus(st)) return { phase: 'running' }
  if (isMjSuccessStatus(st)) return { phase: 'done_ok' }
  return {
    phase: 'done_fail',
    message: mjTaskFailureDisplayMessage(task, 'FAILURE'),
  }
}

/** 解析 task/fetch 的 Nest 包装 + 上游二次包裹 data */
export function parseMjTaskBody(r: any): Record<string, unknown> | null {
  if (!r || r.success === false) return null
  let d = r.data
  if (!d || typeof d !== 'object') return null

  let cur = d as Record<string, unknown>
  for (let depth = 0; depth < 4; depth++) {
    const inner = cur.data
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) break

    const outerHasDirectFields =
      cur.status !== undefined ||
      cur.progress !== undefined ||
      cur.imageUrl !== undefined ||
      cur.image_url !== undefined ||
      cur.failReason !== undefined

    const innerHasTaskFields =
      (inner as Record<string, unknown>).status !== undefined ||
      (inner as Record<string, unknown>).progress !== undefined ||
      (inner as Record<string, unknown>).imageUrl !== undefined ||
      (inner as Record<string, unknown>).image_url !== undefined ||
      (inner as Record<string, unknown>).failReason !== undefined

    if (!outerHasDirectFields && innerHasTaskFields) {
      cur = inner as Record<string, unknown>
      continue
    }
    break
  }
  d = cur

  if (d.task && typeof d.task === 'object' && !Array.isArray(d.task)) {
    const taskLike = d.task as Record<string, unknown>
    const outerHasStatus =
      d.status !== undefined ||
      d.progress !== undefined ||
      d.imageUrl !== undefined ||
      d.image_url !== undefined
    if (
      !outerHasStatus &&
      (taskLike.status !== undefined ||
        taskLike.progress !== undefined ||
        taskLike.imageUrl !== undefined ||
        taskLike.image_url !== undefined)
    ) {
      return taskLike
    }
  }

  return d && typeof d === 'object' ? (d as Record<string, unknown>) : null
}

export function normalizeMjStatus(st: unknown): string {
  return String(st ?? '')
    .trim()
    .toUpperCase()
}

export function isMjTerminalStatus(st: string): boolean {
  return [
    'SUCCESS',
    'FAILURE',
    'FAILED',
    'ERROR',
    'COMPLETE',
    'DONE',
    'CANCELLED',
    'FINISHED',
    'FINISH',
    'OK',
    'SUCCEEDED',
  ].includes(st)
}

export function isMjSuccessStatus(st: string): boolean {
  return ['SUCCESS', 'COMPLETE', 'DONE', 'FINISHED', 'FINISH', 'OK', 'SUCCEEDED'].includes(st)
}

/** 预览弹窗：画面描述 + 上游可能返回的翻译/英文描述 */
export function extractMjViewerCaptions(job: {
  promptLabel: string
  task?: Record<string, unknown>
}): { original: string; translated: string } {
  const task = job.task
  const pick = (keys: string[]): string => {
    if (!task) return ''
    for (const k of keys) {
      const v = task[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
      const props = task.properties as Record<string, unknown> | undefined
      if (props && typeof props[k] === 'string' && String(props[k]).trim()) {
        return String(props[k]).trim()
      }
    }
    return ''
  }

  const translated = pick([
    'enPrompt',
    'en_prompt',
    'translatePrompt',
    'translatedPrompt',
    'translation',
    'promptEn',
    'prompt_en',
    'englishPrompt',
    'english_prompt',
    'englishDescription',
    'promptTranslate',
    'resultEn',
  ])

  const original =
    (job.promptLabel && job.promptLabel.trim()) ||
    pick(['prompt', 'fullPrompt', 'submitPrompt', 'description']) ||
    ''

  if (translated && original && translated === original) {
    return { original, translated: '' }
  }
  return { original, translated }
}

/** 解析 image-seed 接口：兼容多种上游 JSON 包裹 */
export function parseMjImageSeedBody(
  r: unknown
): { ok: true; seed: string } | { ok: false; message: string } {
  const nestErr = nestResultErrorMessage(r)
  if (nestErr) return { ok: false, message: nestErr }
  if (!r || typeof r !== 'object') return { ok: false, message: 'empty' }
  const root = r as Record<string, unknown>
  if (root.success === false) {
    return { ok: false, message: String(root.message || 'request failed') }
  }

  const normalizeSeed = (v: unknown): string | null => {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
    if (typeof v === 'string') {
      const s = v.trim()
      if (!s) return null
      if (/^\d+$/.test(s)) return s
    }
    return null
  }

  const fromObject = (o: Record<string, unknown>): string | null =>
    normalizeSeed(o.seed) ??
    normalizeSeed(o.Seed) ??
    normalizeSeed(o.imageSeed) ??
    normalizeSeed(o.image_seed) ??
    normalizeSeed(o.result)

  let cur: unknown = root.data
  for (let depth = 0; depth < 8; depth++) {
    const asNum = normalizeSeed(cur)
    if (asNum) return { ok: true, seed: asNum }

    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      const o = cur as Record<string, unknown>
      const hit = fromObject(o)
      if (hit) return { ok: true, seed: hit }
      if (o.data !== undefined) {
        cur = o.data
        continue
      }
    }
    break
  }

  return { ok: false, message: 'no seed' }
}
