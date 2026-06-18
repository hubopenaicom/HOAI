import { useAuthStore, useGlobalStore } from '@/store'

export type XhrUploadProgressHandler = (loaded: number, total: number) => void

function joinApiUrl(path: string): string {
  const base = String(import.meta.env.VITE_GLOB_API_URL || '').replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

function buildUploadHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Website-Domain': window.location.origin,
  }
  try {
    const token = useAuthStore().token
    if (token) headers.Authorization = `Bearer ${token}`
    const fp = useGlobalStore()?.fingerprint
    if (fp) headers.Fingerprint = String(fp)
  } catch {
    /* pinia 未就绪时仍尝试上传 */
  }
  return headers
}

function parseXhrJson<T>(xhr: XMLHttpRequest): T {
  const text = xhr.responseText?.trim()
  if (!text) return {} as T
  return JSON.parse(text) as T
}

function xhrErrorMessage(xhr: XMLHttpRequest): string {
  try {
    const body = parseXhrJson<{ message?: string; msg?: string }>(xhr)
    const msg = String(body?.message ?? body?.msg ?? '').trim()
    if (msg) return msg
  } catch {
    /* ignore */
  }
  return xhr.statusText || `HTTP ${xhr.status}`
}

/**
 * 使用 XMLHttpRequest 上传 multipart（支持 upload.onprogress）。
 * 项目 axios 使用 fetch adapter，onUploadProgress 无效，大文件上传需走此路径。
 */
export function xhrMultipartUpload<T = unknown>(options: {
  path: string
  formData: FormData
  timeoutMs?: number
  onProgress?: XhrUploadProgressHandler
}): Promise<T> {
  const { path, formData, onProgress, timeoutMs = 120_000 } = options
  const url = joinApiUrl(path)
  const headers = buildUploadHeaders()

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    xhr.timeout = timeoutMs
    xhr.responseType = 'text'

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value)
    }

    xhr.upload.onprogress = evt => {
      if (!onProgress) return
      const total = evt.lengthComputable ? evt.total : 0
      onProgress(evt.loaded, total > 0 ? total : 0)
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(parseXhrJson<T>(xhr))
        } catch {
          reject(new Error('上传响应解析失败'))
        }
        return
      }
      const err = new Error(xhrErrorMessage(xhr)) as Error & { response?: { status: number } }
      err.response = { status: xhr.status }
      reject(err)
    }

    xhr.onerror = () => reject(new Error('网络错误，上传失败'))
    xhr.ontimeout = () => reject(new Error('上传超时，请稍后重试'))
    xhr.send(formData)
  })
}
