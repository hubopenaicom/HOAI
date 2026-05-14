import { get, post } from '@/utils/request'
import service from '@/utils/request/axios'
import { mjPickRefCdnUrlFromUploadResponse } from '@/utils/mjApiParse'

/** DELETE /drawing/mj/jobs/:id — 删除云端任务记录（需登录） */
export function deleteMjDrawingJob(serverJobId: number) {
  return service.delete(`/drawing/mj/jobs/${serverJobId}`)
}

export type MjSpeedMode = 'fast' | 'turbo' | 'relax'

/** 上游返回体（经全局包装后取 res.data） */
export interface MjSubmitResult {
  code?: number
  description?: string
  result?: string
  properties?: Record<string, unknown>
}

export function submitMjImagine<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  prompt: string
  base64Array?: string[]
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/imagine', data })
}

/**
 * 上传单张参考图，返回 https 直链（--cref / --sref / --oref）。
 * 使用 axios 直连，避免 `@/utils/request` 的 `code` 判定与部分网关/Nest 包装不一致导致误判失败、前端拿不到 `data.url`。
 */
export async function uploadMjRefCdnUrl(data: {
  model: string
  mjMode?: MjSpeedMode
  base64: string
  /** 可选：self | upstream | prefer_self，覆盖服务端参考图存储策略 */
  refStorage?: 'self' | 'upstream' | 'prefer_self'
}): Promise<{ url: string; refSource?: 'self' | 'upstream' }> {
  let body: unknown
  try {
    const res = await service.post<unknown>('/drawing/mj/upload/ref-cdn-url', data, {
      /** 大图 base64 + 上游图床可能较慢 */
      timeout: Math.max(120_000, Number(service.defaults.timeout) || 120_000),
    })
    body = res.data
  } catch (e: unknown) {
    const ax = e as { response?: { data?: unknown }; message?: string }
    const d = ax.response?.data
    let msg = ''
    if (typeof d === 'string') {
      msg = d.slice(0, 500)
    } else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>
      const m = o.message ?? o.msg ?? o.error
      if (Array.isArray(m)) msg = m.map(String).join('; ')
      else if (m != null) msg = String(m)
    }
    if (!msg) msg = ax.message || 'upload failed'
    throw new Error(msg)
  }

  if (typeof body === 'string') {
    const t = body.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        body = JSON.parse(t) as unknown
      } catch {
        /* 保持 string 再走 pick（极少见） */
      }
    }
  }

  const url = mjPickRefCdnUrlFromUploadResponse(body)
  if (!url) {
    const hint =
      body && typeof body === 'object'
        ? JSON.stringify(body).slice(0, 280)
        : String(body).slice(0, 280)
    throw new Error(`NO_URL_IN_RESPONSE:${hint}`)
  }

  let refSource: 'self' | 'upstream' | undefined
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    const inner = o.data
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const rs = (inner as Record<string, unknown>).refSource
      if (rs === 'self' || rs === 'upstream') refSource = rs
    }
    const rs2 = o.refSource
    if (rs2 === 'self' || rs2 === 'upstream') refSource = rs2
  }

  return { url, refSource }
}

export function submitMjAction<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  customId: string
  taskId: string
  /** 仅当服务端 `MJ_ACTION_FORWARD_EXTRAS=1` 时才会转发到上游（OpenAPI 默认不含此字段） */
  botType?: string
  enableRemix?: boolean
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/action', data })
}

export function submitMjChange<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  action: string
  index?: number
  taskId: string
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/change', data })
}

/** POST /drawing/mj/submit/simple-change — 少数代理用 content 表达「任务 + 操作码」（如 taskId + 空格 + U2） */
export function submitMjSimpleChange<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  content: string
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/simple-change', data })
}

export function fetchMjTask<T = any>(id: string, model: string, mjMode: MjSpeedMode) {
  return get<T>({
    url: `/drawing/mj/task/${encodeURIComponent(id)}/fetch`,
    data: { model, mjMode },
  })
}

/** 上游 GET …/task/{id}/image-seed，经后端转发 */
export function fetchMjImageSeed<T = unknown>(id: string, model: string, mjMode: MjSpeedMode) {
  return get<T>({
    url: `/drawing/mj/task/${encodeURIComponent(id)}/image-seed`,
    data: { model, mjMode },
  })
}

export function listMjTasksByIds<T = any>(data: {
  model: string
  mjMode?: MjSpeedMode
  ids?: string[]
}) {
  return post<T>({ url: '/drawing/mj/task/list-by-condition', data })
}

export function submitMjBlend<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  base64Array: string[]
  dimensions?: string
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/blend', data })
}

export function submitMjDescribe<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  base64: string
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/describe', data })
}

export function submitMjShorten<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  prompt: string
  botType?: string
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/shorten', data })
}

/** POST /drawing/mj/submit/modal — 局部重绘 / Zoom（上游 /mj/submit/modal） */
export function submitMjModal<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  taskId: string
  prompt?: string
  maskBase64?: string
  /** 部分上游（如 DMX）：true 返回原始图链 */
  noStorage?: boolean
  notifyHook?: string
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/modal', data })
}

/**
 * POST /drawing/mj/submit/edits — 图 URL + 提示词编辑（上游 /mj/submit/edits，非所有代理均支持）
 */
export function submitMjEdits<T = MjSubmitResult>(data: {
  model: string
  mjMode?: MjSpeedMode
  prompt: string
  image: string
  maskBase64?: string
  notifyHook?: string
  /** 仅当服务端 `MJ_EDITS_FORWARD_EXTRAS=1` 时转发 */
  state?: string
}) {
  return post<T>({ url: '/drawing/mj/submit/edits', data })
}

/** GET /drawing/mj/jobs 列表项 */
export interface MjDrawingJobDto {
  id: number
  clientKey?: number
  taskId: string
  /** 父任务 MJ taskId（后续操作来源） */
  parentTaskId?: string
  /** 父任务 clientKey，与前端 localId 一致 */
  parentClientKey?: number
  modelKey: string
  mjMode: MjSpeedMode
  mjStyleSnapshot?: string
  promptLabel: string
  loading: boolean
  error?: string
  task?: Record<string, unknown>
  /** 本次提交扣费积分（与服务端 withBalance 一致估算） */
  deductCharged?: number
  chargeMult?: number
  deductTypeSnapshot?: number
}

/** 与后端 CreateDrawingMjJobDto 一致，按 clientKey + 用户幂等 */
export interface MjDrawingJobSnapshot {
  clientKey: number
  taskId?: string
  parentTaskId?: string | null
  parentClientKey?: string | number | null
  modelKey: string
  mjMode: MjSpeedMode
  mjStyleSnapshot?: string
  promptLabel: string
  loading: boolean
  error?: string
  task?: Record<string, unknown>
  deductCharged?: number | null
  chargeMult?: number | null
  deductTypeSnapshot?: number | null
}

/** GET /drawing/mj/jobs 返回体内字段 */
export interface MjDrawingJobsListPayload {
  list?: MjDrawingJobDto[]
  /** 与服务端 users.mj_jobs_sync_seq 对齐；DELETE 会递增 */
  syncSeq?: number
}

export function fetchMjDrawingJobsList(params?: { limit?: number }) {
  return get<MjDrawingJobsListPayload>({
    url: '/drawing/mj/jobs',
    data: { limit: params?.limit ?? 80 },
  })
}

export interface MjBatchUpsertResult {
  synced: number
  stale?: boolean
  syncSeq?: number
}

export function batchUpsertMjDrawingJobs(data: {
  jobs: MjDrawingJobSnapshot[]
  /** 须与最近一次 GET /drawing/mj/jobs 或 DELETE 返回的 syncSeq 一致；陈旧快照会被拒绝以防复活已删任务 */
  baseSyncSeq?: number
}) {
  return post<MjBatchUpsertResult>({ url: '/drawing/mj/jobs/batch-upsert', data })
}

/** 服务端代理拉取远程图（绕开浏览器跨域），需登录 */
export async function fetchMjProxyImageBlob(imageUrl: string): Promise<Blob> {
  const res = await service.get<ArrayBuffer>('/drawing/mj/proxy-image', {
    params: { url: imageUrl },
    responseType: 'arraybuffer',
    timeout: 60000,
  })
  const raw = res.headers['content-type']
  const ct = (Array.isArray(raw) ? raw[0] : raw) || 'application/octet-stream'
  const mime = String(ct).split(';')[0].trim()
  return new Blob([res.data], { type: mime || 'application/octet-stream' })
}

/** 复用 proxy-image，转为 blob: URL 供绘画卡片 <img> 同源内嵌（带 JWT） */
export async function fetchMjProxyImageInlineBlobUrl(remoteUrl: string): Promise<string> {
  const blob = await fetchMjProxyImageBlob(remoteUrl)
  return URL.createObjectURL(blob)
}
