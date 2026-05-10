import { get, post } from '@/utils/request'
import service from '@/utils/request/axios'

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

/** GET /drawing/mj/jobs 列表项 */
export interface MjDrawingJobDto {
  id: number
  clientKey?: number
  taskId: string
  modelKey: string
  mjMode: MjSpeedMode
  mjStyleSnapshot?: string
  promptLabel: string
  loading: boolean
  error?: string
  task?: Record<string, unknown>
}

/** 与后端 CreateDrawingMjJobDto 一致，按 clientKey + 用户幂等 */
export interface MjDrawingJobSnapshot {
  clientKey: number
  taskId?: string
  modelKey: string
  mjMode: MjSpeedMode
  mjStyleSnapshot?: string
  promptLabel: string
  loading: boolean
  error?: string
  task?: Record<string, unknown>
}

export function fetchMjDrawingJobsList(params?: { limit?: number }) {
  return get({
    url: '/drawing/mj/jobs',
    data: { limit: params?.limit ?? 80 },
  })
}

export function batchUpsertMjDrawingJobs<T = { synced: number }>(data: {
  jobs: MjDrawingJobSnapshot[]
}) {
  return post<T>({ url: '/drawing/mj/jobs/batch-upsert', data })
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
