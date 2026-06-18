/** 解包 Nest Result（code:200 / success:true）与 Suno 网关信封（code:success） */
export function unwrapMusicApiData<T = unknown>(res: unknown): T {
  let cur: unknown = res
  for (let depth = 0; depth < 4; depth++) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) break
    const o = cur as Record<string, unknown>
    const code = o.code
    const codeStr = String(code ?? '').toLowerCase()
    const isNestOk = o.success === true || code === 200 || code === 0 || Number(code) === 200
    const isSunoOk = codeStr === 'success' || codeStr === 'ok'
    if ((isNestOk || isSunoOk) && o.data !== undefined) {
      cur = o.data
      continue
    }
    if (o.data != null && typeof o.data === 'object') {
      cur = o.data
      continue
    }
    break
  }
  return cur as T
}

/** 从上传接口响应中解析 clip_id 或待轮询的 task/upload token */
export function parseUploadClipId(body: unknown): string {
  const data = unwrapMusicApiData<unknown>(body)
  if (typeof data === 'string') return data.trim()
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>
    if (typeof o.data === 'string') return o.data.trim()
    return String(o.clip_id ?? o.clipId ?? o.task_id ?? o.id ?? '').trim()
  }
  return ''
}

/** 解析上传 token；无有效值时抛出可映射的业务错误码 upload_no_clip_id */
export function parseUploadClipIdOrThrow(body: unknown): string {
  const token = parseUploadClipId(body)
  if (!token) throw new Error('upload_no_clip_id')
  return token
}
