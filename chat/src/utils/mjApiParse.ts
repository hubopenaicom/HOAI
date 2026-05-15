/** 绘画页轮询上游 task/fetch 的间隔（毫秒），须与 service midjourney.constant 中 MJ_UPSTREAM_POLL_INTERVAL_MS 一致 */
export const MJ_TASK_POLL_INTERVAL_MS = 2500

/**
 * 单次出图最大轮询次数（× {@link MJ_TASK_POLL_INTERVAL_MS}）。
 * 须与 service/src/common/constants/midjourney.constant.ts 中 mjUpstreamPollMaxIterations 同步。
 */
export function mjTaskPollMaxIterations(mjMode: string | undefined): number {
  const m = String(mjMode ?? 'fast').toLowerCase()
  if (m === 'relax') return 720
  return 480
}

/**
 * cref/sref/oref 直链最大长度（与绘画页存储截断一致）。
 * 对象存储签名 URL、Discord 带鉴权参数链常超过 2048，过短会导致「上传成功但校验永远失败、--cref 不进 prompt」。
 */
export const MJ_EXT_REF_URL_MAX_LEN = 8192

/** 写入 ref / localStorage 前统一截断，避免与 {@link mjExtRefUrlSanitized} 长度上限不一致 */
export function mjClipExtRefUrlForStorage(raw: string): string {
  return String(raw ?? '')
    .trim()
    .slice(0, MJ_EXT_REF_URL_MAX_LEN)
}

/**
 * cref/sref/oref 直链：与绘画页拼入 prompt 的规则一致。
 * 去除 BOM/零宽、换行；去掉用户误粘贴的一层引号；仅接受 http(s)。
 */
export function mjExtRefUrlSanitized(raw: string): string | null {
  let t = String(raw ?? '')
    .trim()
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .replace(/[\r\n]+/g, '')
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }
  /** 部分图床返回 `//host/path`，Midjourney 与校验逻辑均按绝对 URL 处理 */
  if (/^\/\//.test(t)) {
    t = `https:${t}`
  }
  if (!t || t.length > MJ_EXT_REF_URL_MAX_LEN) return null
  if (!/^https?:\/\//i.test(t)) return null
  return t
}

export function mjExtRefUrlLooksUsable(raw: string): boolean {
  return mjExtRefUrlSanitized(raw) !== null
}

/**
 * 从任意 JSON 结构里找出第一个可通过 {@link mjExtRefUrlSanitized} 的 http(s) 链。
 * 用于上传接口返回体字段名不统一、多层嵌套时仍能解析出 --cref/--sref/--oref 所需直链。
 */
export function mjPickFirstHttpUrlFromUnknownJson(root: unknown, maxDepth = 14): string | null {
  const seen = new WeakSet<object>()
  const walk = (o: unknown, depth: number): string | null => {
    if (depth <= 0 || o == null) return null
    if (typeof o === 'string') {
      return mjExtRefUrlSanitized(o)
    }
    if (typeof o !== 'object') return null
    if (seen.has(o as object)) return null
    seen.add(o as object)
    if (Array.isArray(o)) {
      for (const it of o) {
        const hit = walk(it, depth - 1)
        if (hit) return hit
      }
      return null
    }
    for (const v of Object.values(o as Record<string, unknown>)) {
      const hit = walk(v, depth - 1)
      if (hit) return hit
    }
    return null
  }
  return walk(root, maxDepth)
}

/**
 * 从「参考图上传」接口响应中取出可写入 --cref/--sref/--oref 的 https 直链。
 * 兼容：Nest {@link Result}（code/success/data）、网关二次包裹、字段别名、data 为 JSON 字符串、result 为 URL 数组等。
 */
export function mjPickRefCdnUrlFromUploadResponse(r: unknown): string {
  const pick = (s: string): string => mjExtRefUrlSanitized(s) || ''

  const walk = (o: unknown, depth: number): string => {
    if (depth <= 0 || o == null) return ''
    if (typeof o === 'string') {
      const t = o.trim()
      if (pick(t)) return pick(t)
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try {
          return walk(JSON.parse(t), depth - 1)
        } catch {
          return ''
        }
      }
      return ''
    }
    if (typeof o !== 'object') return ''
    if (Array.isArray(o)) {
      for (const it of o) {
        const x = walk(it, depth - 1)
        if (x) return x
      }
      return ''
    }
    const rec = o as Record<string, unknown>
    const strKeys = [
      'url',
      'link',
      'href',
      'cdnUrl',
      'cdn_url',
      'imageUrl',
      'image_url',
      'fileUrl',
      'file_url',
      'picUrl',
      'pic_url',
      'ossUrl',
    ] as const
    for (const k of strKeys) {
      const v = rec[k]
      if (typeof v === 'string') {
        const u = pick(v)
        if (u) return u
      }
    }
    const res0 = rec.result
    if (typeof res0 === 'string') {
      const u = pick(res0)
      if (u) return u
    }
    if (Array.isArray(res0)) {
      for (const it of res0) {
        const x = walk(it, depth - 1)
        if (x) return x
      }
    }
    if (rec.data !== undefined) {
      const x = walk(rec.data, depth - 1)
      if (x) return x
    }
    return ''
  }

  const hit = walk(r, 16)
  if (hit) return hit
  return mjPickFirstHttpUrlFromUnknownJson(r) || ''
}

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
 * 兼容常见 Midjourney 代理的多种字段名与一层嵌套。
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

/** 收集任务里可展示的 HTTP(S) 图片地址（含四宫格 / 多 URL），去重；顺序为历史兼容（偏先大图字段） */
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

/**
 * Describe 结果弹窗顶部「参考图」：部分上游把 `imageUrl` 设为低清占位或品牌缩略图，
 * 而将可用预览放在 `imageUrls` 或渐进链的末帧；本函数按该顺序择优。
 */
export function pickMjDescribeModalHeroImageUrl(
  task: Record<string, unknown> | undefined
): string | undefined {
  if (!task) return undefined
  const props = task.properties as Record<string, unknown> | undefined
  const listRaw = task.imageUrls ?? task.image_urls ?? props?.imageUrls ?? props?.image_urls
  const urlOk = (s: string) => /^https?:\/\//i.test(s.trim())

  if (Array.isArray(listRaw)) {
    const urls = [
      ...new Set(
        listRaw.filter((u): u is string => typeof u === 'string' && urlOk(u)).map(u => u.trim())
      ),
    ]
    if (urls.length >= 1) {
      const iu = String(
        task.imageUrl ?? task.image_url ?? props?.imageUrl ?? props?.image_url ?? ''
      ).trim()
      /** 多格分图且顶层主链与格子 URL 均不同 → 顶层常为整张四宫合成图 */
      if (urls.length >= 2 && iu && urlOk(iu) && !urls.includes(iu)) return iu
      return urls[0]
    }
  }

  const chain = collectMjImageProgressiveChain(task)
  const last = chain.length ? String(chain[chain.length - 1] ?? '').trim() : ''
  if (last && urlOk(last)) return last
  return collectMjImageUrls(task)[0]
}

/**
 * 多图分槽（常见 2×2 四宫）：仅当 imageUrls 数组有 2 条及以上有效 URL 时返回，否则 null（走渐进单图链）。
 */
export function collectMjImageMultiSlotForGrid(
  task: Record<string, unknown> | undefined
): string[] | null {
  if (!task) return null
  const props = task.properties as Record<string, unknown> | undefined
  const list = task.imageUrls ?? task.image_urls ?? props?.imageUrls ?? props?.image_urls
  if (!Array.isArray(list) || list.length < 2) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of list) {
    if (typeof u !== 'string') continue
    const s = u.trim()
    if (!/^https?:\/\//i.test(s) || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out.length >= 2 ? out : null
}

/**
 * 单合成图 / 单 URL：先轻后重，供前端渐进显示（预览 → 清晰）。
 * 若仅有 imageUrls 单元素，会排在链末作为「主图」。
 */
export function collectMjImageProgressiveChain(
  task: Record<string, unknown> | undefined
): string[] {
  if (!task) return []
  if (collectMjImageMultiSlotForGrid(task)) return []

  const out: string[] = []
  const seen = new Set<string>()
  const add = (u: unknown) => {
    if (typeof u !== 'string') return
    const s = u.trim()
    if (!/^https?:\/\//i.test(s) || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }

  add(task.progressImageUrl)
  add(task.tempImageUrl)
  add(task.previewUrl)
  add(task.preview_url)
  add(task.thumbnailUrl)
  add(task.thumbnail_url)
  add(task.coverUrl)
  const props = task.properties as Record<string, unknown> | undefined
  if (props) {
    add(props.previewUrl)
    add(props.preview_url)
    add(props.thumbnailUrl)
    add(props.thumbnail_url)
  }
  add(task.imageUrl)
  add(task.image_url)
  add(task.cdnImage)
  add(task.picUrl)
  add(task.pic_url)
  add(task.discordImageUrl)
  const list = task.imageUrls ?? task.image_urls ?? props?.imageUrls ?? props?.image_urls
  if (Array.isArray(list) && list.length === 1) list.forEach(add)

  if (out.length === 0) {
    for (const u of collectMjImageUrls(task)) add(u)
  }
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

/** 常见上游英文/中文错误 → i18n key（`drawing.*`） */
export function mjKnownDrawingErrorI18nKey(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const low = s.toLowerCase()
  if (
    /unlock\s+your\s+global\s+personalization|global\s+personalization[^\n]{0,80}\bv8\b|\bv8\b[^\n]{0,80}global\s+personalization/i.test(
      s
    )
  ) {
    return 'drawing.mjErrV8GlobalPersonalization'
  }
  if (/not_enough_ratings/i.test(s) || /\bnot\s+enough\s+ratings\b/i.test(s)) {
    return 'drawing.mjErrNotEnoughRatings'
  }
  if (/queue\s+is\s+full|queue\s+full|the\s+queue\s+is\s+full|^queue[\s,:_-]*full/i.test(low))
    return 'drawing.mjErrQueueFull'
  if (/队列已满|排队已满|任务队列已满/.test(s)) return 'drawing.mjErrQueueFull'
  return null
}

/** 命中已知绘制错误时返回翻译，否则原样返回 */
export function mjTranslateKnownDrawingError(
  raw: string | undefined | null,
  translate: (key: string) => string
): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const key = mjKnownDrawingErrorI18nKey(s)
  return key ? translate(key) : s
}

/**
 * 部分聚合任务在 description 与 failReason 上不一致（例如「等窗口确认」却标成无效参数），
 * 合并判断以免用户只看到笼统的 failReason。
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

/**
 * 本站后续任务标题模板（与 i18n `drawing.mjFollowUpLabeled` 及历史/变体格式一致）会反复把父摘要包进「来自…「…」…」，
 * 若不处理展示层会堆叠「来自」；更关键的是 {@link mjParentLineForFollowUp} 若把整段「来自「…」· 操作」
 * 直接塞进下一次 i18n `mjFollowUpLabeled` 的 `{source}`，模板会再包一层「来自「」，每多一级后续就多一层。
 *
 * - **展示**（画面描述、父任务摘要）：用 {@link mjCollapseNestedFollowUpLabelForDisplay}，保留最外层「来自「源」· / - 操作」，只把「源」里的嵌套剥干净。
 * - **仅要纯提示词**（如比对、剥壳递归）：用 {@link mjUnwrapFollowUpPromptLabel}。
 *
 * 变体：部分环境或旧文案会在「来自」与「」之间插入空格（`来自 「`）；动作用连字符（` - U1 - 左上`）而非中间点 `·`；
 * 或混用 `『』`、半角 `｢｣`（FF62/FF63）；或 `」` 与操作段顺序与模板不完全一致时需栈匹配。
 * 另有「来自于」口语、以及截断/拼接导致的「来自「来自 提示词」」（内层无第二重「」）等，见 {@link mjNormalizeFollowUpQuotedSource}。
 */

/** `」` 之后、操作文案之前：中间点、全角点、连字符等（兼容 `·` 与 ` - U1`） */
const MJ_FOLLOW_UP_AFTER_SOURCE_RE = /^(?:[·\u00b7\u30fb．]|\s*[-–—])\s*/

/** 前缀「来自」类 token（与 i18n `mjFollowUpLabeled`、历史脏数据对齐） */
const MJ_FROM_HEAD_RE_SRC = '(?:来自|來自|来自于|來自於|From|from)'

/** 半角「」→ 标准直角引号（不做 NFKC，以免把 ， 等标点改成半角） */
function normalizeMjFollowUpLabelText(s: string): string {
  return String(s ?? '')
    .replace(/\uFF62/g, '\u300C') // ｢ → 「
    .replace(/\uFF63/g, '\u300D') // ｣ → 」
}

const MJ_FOLLOW_UP_HEAD_RE = new RegExp(`^${MJ_FROM_HEAD_RE_SRC}\\s*`, 'i')

/** 行首连续两段「来自」口令紧接一个「：压成一段，修复 `来自来自「` / `来自「来自来自「` 内层 */
function mjCollapseDuplicateFromBeforeInnerQuote(raw: string): string {
  let t = normalizeMjFollowUpLabelText(String(raw ?? '').trim())
  const re = new RegExp(`^(${MJ_FROM_HEAD_RE_SRC})(${MJ_FROM_HEAD_RE_SRC})(\\s*「)`, 'i')
  for (let n = 0; n < 32; n++) {
    if (!re.test(t)) break
    t = normalizeMjFollowUpLabelText(t.replace(re, '$1$3').trim())
  }
  return t
}

/**
 * 解析最外层「来自…「来源」·/ - 操作」结构；无法解析则返回 null。
 * prefix 含至开引号；tail 自闭引号「」起至串末。
 */
function matchMjFollowUpShell(
  raw: string
): { prefix: string; source: string; tail: string } | null {
  const t = normalizeMjFollowUpLabelText(raw.trim())
  const hm = MJ_FOLLOW_UP_HEAD_RE.exec(t)
  if (!hm) return null
  let i = hm[0].length
  const open = t[i]
  if (open !== '「' && open !== '『') return null
  const expectFirst = open === '「' ? '」' : '』'
  const bracketIdx = i
  i += 1
  const sourceStart = i
  const stack: string[] = [expectFirst]
  while (i < t.length && stack.length > 0) {
    const ch = t[i]
    if (ch === '「') {
      stack.push('」')
      i += 1
      continue
    }
    if (ch === '『') {
      stack.push('』')
      i += 1
      continue
    }
    const top = stack[stack.length - 1]
    if (ch === top) {
      stack.pop()
      i += 1
      continue
    }
    i += 1
  }
  if (stack.length !== 0) return null

  const afterSource = t.slice(i).trimStart()
  if (!MJ_FOLLOW_UP_AFTER_SOURCE_RE.test(afterSource) && afterSource.length > 0) return null

  const prefix = t.slice(0, bracketIdx + 1)
  const source = t.slice(sourceStart, i - 1)
  const tail = t.slice(i - 1)
  return { prefix, source, tail }
}

/** 剥掉一层「前缀 + 成对括号内来源 + 分隔符 + 操作」外壳；无法解析则返回 null */
function stripOneMjFollowUpLabelLayer(raw: string): string | null {
  const m = matchMjFollowUpShell(raw)
  if (!m) return null
  const inner = m.source.trim()
  return inner || null
}

const MJ_DOUBLE_FROM_OPEN_RE = new RegExp(
  `^${MJ_FROM_HEAD_RE_SRC}\\s*「\\s*${MJ_FROM_HEAD_RE_SRC}\\s*「`,
  'i'
)

const MJ_FIRST_FROM_OPEN_RE = new RegExp(`^${MJ_FROM_HEAD_RE_SRC}\\s*「\\s*`, 'i')

/**
 * 当括号与模板不完全一致导致 stripOne 失败时，去掉最外层「来自「…」」前缀（仅在有明显双重套娃时）。
 */
function mjPeelDoubleFollowUpHead(raw: string): string | null {
  const t = normalizeMjFollowUpLabelText(raw.trim())
  if (!MJ_DOUBLE_FROM_OPEN_RE.test(t)) return null
  return t.replace(MJ_FIRST_FROM_OPEN_RE, '').trim()
}

/**
 * 行首反复出现「来自「来自「…」（可无空格）时逐层剥掉多余前缀；不依赖整串能否 parse 成壳（截断/缺 `」` 时常仍有效）。
 */
function mjPeelLeadingStackedFromOpens(raw: string): string {
  let t = normalizeMjFollowUpLabelText(String(raw ?? '').trim())
  for (let n = 0; n < 64; n++) {
    const p = mjPeelDoubleFollowUpHead(t)
    if (p == null || p === t) break
    t = normalizeMjFollowUpLabelText(p.trim())
  }
  return t
}

/**
 * 引号内串已无法解析成「来自「…」· 操作」壳，但行首仍带松散 `来自 / 来自于 + 空格 + 正文`（无第二重「」）时剥掉，
 * 修复 `来自「来自 某提示词」` 类脏数据（父摘要被包进引号时多写了一个「来自」）。
 */
function mjStripLooseLeadingFromWhenNotShell(raw: string): string {
  let t = normalizeMjFollowUpLabelText(String(raw ?? '').trim())
  if (!t) return t
  const loose = new RegExp(`^${MJ_FROM_HEAD_RE_SRC}\\s+(?![「『])`, 'i')
  for (let n = 0; n < 48; n++) {
    if (matchMjFollowUpShell(t)) break
    if (!loose.test(t)) break
    t = normalizeMjFollowUpLabelText(t.replace(loose, '').trim())
  }
  return t
}

/** 连续剥壳至最内层，供父任务摘要、预览「画面描述」、列表主文案使用 */
export function mjUnwrapFollowUpPromptLabel(label: string): string {
  let cur = mjCollapseDuplicateFromBeforeInnerQuote(String(label ?? '').trim())
  for (let n = 0; n < 48; n++) {
    const inner = stripOneMjFollowUpLabelLayer(cur)
    if (inner != null) {
      cur = mjCollapseDuplicateFromBeforeInnerQuote(inner.trim())
      continue
    }
    const peeled = mjPeelDoubleFollowUpHead(cur)
    if (peeled != null && peeled !== cur) {
      cur = mjCollapseDuplicateFromBeforeInnerQuote(peeled.trim())
      continue
    }
    break
  }
  return cur
}

/**
 * 引号内「来源」字段：先 {@link mjUnwrapFollowUpPromptLabel}；若仍残留「来自「来自「」套娃（unwrap 因分隔符与模板不一致失败），
 * 用 {@link mjPeelDoubleFollowUpHead} 逐层剥掉多余前缀后再 unwrap，直到干净或达上限；
 * 并压平行首「来自来自「」、去掉无法成壳的多余「来自 + 空格」前缀。
 */
function mjNormalizeFollowUpQuotedSource(source: string): string {
  let t = normalizeMjFollowUpLabelText(String(source ?? '').trim())
  if (!t) return t
  t = mjPeelLeadingStackedFromOpens(t)
  t = mjCollapseDuplicateFromBeforeInnerQuote(t)
  t = mjUnwrapFollowUpPromptLabel(t).trim() || t
  t = mjCollapseDuplicateFromBeforeInnerQuote(t)
  for (let n = 0; n < 32; n++) {
    if (!MJ_DOUBLE_FROM_OPEN_RE.test(t)) break
    const peeled = mjPeelDoubleFollowUpHead(t)
    if (!peeled || peeled === t) break
    let nxt = mjUnwrapFollowUpPromptLabel(peeled).trim() || peeled.trim()
    nxt = mjCollapseDuplicateFromBeforeInnerQuote(nxt)
    if (nxt === t) break
    t = nxt
  }
  t = mjStripLooseLeadingFromWhenNotShell(t)
  return t
}

/**
 * 展示用：保留最外层「来自「…」· / - 操作」以便看出自哪条任务、哪一步；
 * 仅对引号内的「来源」文本递归 {@link mjUnwrapFollowUpPromptLabel}，去掉嵌套套娃，避免再次提交时指数级「来自」。
 */
export function mjCollapseNestedFollowUpLabelForDisplay(label: string): string {
  let t0 = normalizeMjFollowUpLabelText(String(label ?? '').trim())
  t0 = mjPeelLeadingStackedFromOpens(t0)
  const shell = matchMjFollowUpShell(t0)
  if (!shell) return t0
  const cleanedSource = mjNormalizeFollowUpQuotedSource(shell.source).trim() || shell.source.trim()
  return `${shell.prefix}${cleanedSource}${shell.tail}`
}

/**
 * 供下一次 `drawing.mjFollowUpLabeled` 模板的 `{source}`：父摘要若已是「来自「…」· 操作」，
 * 则去掉最外层壳，只保留「引号内来源（已归一）+ 父级操作名」，避免再包一层「来自「」造成套娃。
 */
export function mjFollowUpSourceTextForNextWrap(label: string): string {
  const t0 = normalizeMjFollowUpLabelText(String(label ?? '').trim())
  if (!t0) return ''
  let collapsed = mjCollapseNestedFollowUpLabelForDisplay(t0).trim() || t0
  let shell = matchMjFollowUpShell(collapsed)
  if (!shell) {
    const peeled = mjPeelLeadingStackedFromOpens(collapsed)
    if (peeled !== collapsed) {
      collapsed = mjCollapseNestedFollowUpLabelForDisplay(peeled).trim() || peeled
      shell = matchMjFollowUpShell(collapsed)
    }
  }
  if (!shell) return collapsed.trim()
  const src = mjNormalizeFollowUpQuotedSource(shell.source).trim() || shell.source.trim()
  let afterClose = shell.tail
  const fc = afterClose.charAt(0)
  if (fc === '」' || fc === '』') afterClose = afterClose.slice(1)
  let rest = normalizeMjFollowUpLabelText(afterClose).trim()
  if (MJ_FOLLOW_UP_AFTER_SOURCE_RE.test(rest)) {
    rest = rest.replace(MJ_FOLLOW_UP_AFTER_SOURCE_RE, '').trim()
  }
  if (rest) {
    return `${src} · ${rest}`.replace(/\s*·\s*·+/g, ' · ').trim()
  }
  return src
}

/** clamp 写入的「…」或残缺 `--v..」` 等（历史父摘要曾限 52 字）；与上游首行比对前缀后决定是否用上游补全引号内来源 */
function mjFollowUpSourceLooksTruncated(source: string): boolean {
  const s = source.trim()
  if (!s) return false
  if (s.includes('\u2026') || s.includes('…')) return true
  if (/--v\.{2,}/i.test(s)) return true
  if (/\.{2}\s*[\)」』]/.test(s)) return true
  return false
}

function mjCommonPrefixLen(a: string, b: string, max = 28): number {
  const lim = Math.min(a.length, b.length, max)
  let n = 0
  while (n < lim && a.charCodeAt(n) === b.charCodeAt(n)) n += 1
  return n
}

/**
 * 后续任务 `promptLabel` 中「来源」易被单行截断并带 …，导致壳解析失败；
 * 用上游 {@link mjTaskPromptFirstLine} 在保留「来自「…」· 操作」外壳的前提下补全，供预览/全文卡片使用。
 */
export function mjRepairFollowUpCaptionWithUpstream(
  promptLabel: string,
  upstreamFirstLine: string
): string {
  const raw = (promptLabel || '').trim()
  const up = (upstreamFirstLine || '').trim()
  const collapsed = mjCollapseNestedFollowUpLabelForDisplay(raw)
  if (!raw || !up) return collapsed

  const shell = matchMjFollowUpShell(collapsed)
  if (!shell) return collapsed

  const src = shell.source.trim()
  const srcCore = mjUnwrapFollowUpPromptLabel(src).trim() || src
  const upCore = mjUnwrapFollowUpPromptLabel(up).trim() || up
  if (!srcCore) return collapsed

  const truncated = mjFollowUpSourceLooksTruncated(src)
  const upstreamMuchLonger = upCore.length > srcCore.length + 6
  const prefixOk = mjCommonPrefixLen(srcCore, upCore) >= 10

  if (!truncated && !(upstreamMuchLonger && prefixOk)) return collapsed

  const rawInner = mjCollapseNestedFollowUpLabelForDisplay(up).trim() || up
  const newInner = mjNormalizeFollowUpQuotedSource(rawInner).trim() || rawInner
  return `${shell.prefix}${newInner}${shell.tail}`
}

function mjCaptionCollapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** 局部重绘、父任务摘要、翻译副行等共用：从上游 task 抽「首行」有效提示（含 properties） */
export function mjTaskPromptFirstLine(task: Record<string, unknown> | undefined): string {
  if (!task) return ''
  const pr = task.properties as Record<string, unknown> | undefined
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const firstLine = (s: string) => {
    const line = s.split(/\r?\n/)[0]?.trim() ?? ''
    return line.replace(/^\/(?:imagine|describe|shorten)\s+/i, '').trim() || line
  }
  const tryPick = (v: unknown) => {
    const s = pick(v)
    return s ? firstLine(s) : ''
  }
  return (
    tryPick(task.promptEn) ||
    tryPick(task.prompt) ||
    tryPick(pr?.finalPrompt) ||
    tryPick(pr?.promptEn) ||
    tryPick(pr?.prompt) ||
    tryPick(task.description) ||
    ''
  )
}

function mjCaptionLineLooksLikeMjError(s: string): boolean {
  const t = s.trim()
  if (!t) return true
  if (mjKnownDrawingErrorI18nKey(t)) return true
  if (
    /^invalid\s*parameter|^无效参数|waiting\s*for\s*window\s*confirm|窗口等待|^\[?\s*invalid/i.test(
      t
    )
  )
    return true
  if (
    t.length <= 240 &&
    !/[,]|--ar\s|--v\s|--niji/i.test(t) &&
    /^(error|fail|exception)\b/i.test(t)
  )
    return true
  return false
}

/** 预览弹窗 / 任务卡片：主行（用户侧摘要）+ 副行（英译或上游最终提示词等） */
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

  const upstreamLine = mjTaskPromptFirstLine(task)

  let translated = pick([
    'zhPrompt',
    'zh_prompt',
    'cnPrompt',
    'cn_prompt',
    'chinesePrompt',
    'chinese_prompt',
    'promptZh',
    'prompt_zh',
    'resultZh',
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

  const labelRaw = (job.promptLabel && job.promptLabel.trim()) || ''
  const pickStr = pick(['prompt', 'fullPrompt', 'submitPrompt', 'description']) || ''

  const upTrim = upstreamLine.trim()
  let candidateOriginal = labelRaw || upTrim || pickStr.trim() || ''
  if (labelRaw && upTrim) {
    candidateOriginal = mjRepairFollowUpCaptionWithUpstream(labelRaw, upTrim)
  }

  const original =
    mjCollapseNestedFollowUpLabelForDisplay(candidateOriginal).trim() || candidateOriginal.trim()

  if (!translated && task && mjTaskPollOutcome(task).phase !== 'done_fail' && upstreamLine.trim()) {
    const u = upstreamLine.trim()
    if (
      mjCaptionCollapseWs(u) !== mjCaptionCollapseWs(original) &&
      !mjCaptionLineLooksLikeMjError(u)
    ) {
      translated = u
    }
  }

  if (translated && original && mjCaptionCollapseWs(translated) === mjCaptionCollapseWs(original)) {
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
