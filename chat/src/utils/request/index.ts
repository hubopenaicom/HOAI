import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { message } from '@/utils/message'
import type { AxiosProgressEvent, AxiosResponse, GenericAbortSignal } from 'axios'
import request from './axios'

export interface HttpOption {
  url: string
  data?: any
  method?: string
  headers?: any
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
  signal?: GenericAbortSignal
  beforeRequest?: () => void
  afterRequest?: () => void
}

export interface Response<T = any> {
  data: T
  message: string | null
  status: string
  code?: number
  success?: boolean
}

let last401ErrorTimestamp = 0
const homePagePath = ['/chatlog/chatList', '/group/query']

function hasWhitePath(path: string) {
  if (!path) return false
  return homePagePath.some(item => path.includes(item))
}

function http<T = any>({
  url,
  data,
  method,
  headers,
  onDownloadProgress,
  signal,
  beforeRequest,
  afterRequest,
}: HttpOption) {
  const ms = message()

  const successHandler = (res: AxiosResponse<Response<T>>) => {
    const authStore = useAuthStore()

    const code = res.data.code
    /** Nest Result 为 200；少数网关用 1 表示成功，若仍带 success:true 则放行 */
    const okBySuccessFlag = res.data.success === true
    const okByHttpStyleCode =
      (typeof code === 'number' && code >= 200 && code < 300) ||
      (typeof code === 'string' && Number(code) >= 200 && Number(code) < 300)
    const okByLegacyBizCode = typeof code === 'number' && code > 0 && code < 200 && okBySuccessFlag

    if (
      okByHttpStyleCode ||
      okByLegacyBizCode ||
      code == null ||
      code === false ||
      Number(code) === 0
    )
      return res.data

    if (code === 401) {
      authStore.removeToken()
      window.location.reload()
    }

    return Promise.reject(res.data)
  }

  const failHandler = (error: any) => {
    const authStore = useAuthStore()
    let data: any = ''
    if (error?.response?.data) {
      data = error.response.data
    }
    afterRequest?.()
    const status = error?.response?.status

    if (status === 401) {
      authStore.removeToken()
      if (!hasWhitePath(error?.request?.responseURL)) {
        authStore.loadInit && authStore.setLoginDialog(true)
        const message = error?.response?.data?.message || '请先登录后再进行使用！'
        if (Date.now() - last401ErrorTimestamp > 3000) {
          ms.error(message)
        }
      }
      last401ErrorTimestamp = Date.now()
    } else if (status === 413) {
      const msg = t('drawing.mjPayloadTooLarge')
      ms.error(msg)
      throw new Error(msg)
    } else {
      if (data && typeof data === 'object' && !data?.success) {
        ms.error(data?.message || '请求接口错误！')
      }
    }
    throw new Error(error?.response?.data?.message || error?.message || 'Error')
  }

  beforeRequest?.()

  method = method || 'GET'

  const params = Object.assign(typeof data === 'function' ? data() : (data ?? {}), {})

  if (url.includes('getOldQRCode')) {
    console.log('[请求调试] GET请求参数转换:', {
      url,
      originalData: data,
      convertedParams: params,
    })
  }

  return method === 'GET'
    ? request.get(url, { params, signal, onDownloadProgress }).then(successHandler, failHandler)
    : request
        .post(url, params, { headers, signal, onDownloadProgress })
        .then(successHandler, failHandler)
}

export function get<T = any>({
  url,
  data,
  method = 'GET',
  onDownloadProgress,
  signal,
  beforeRequest,
  afterRequest,
}: HttpOption): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function post<T = any>({
  url,
  data,
  method = 'POST',
  headers,
  onDownloadProgress,
  signal,
  beforeRequest,
  afterRequest,
}: HttpOption): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export default post
