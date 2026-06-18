import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { formatApiErrorMessage } from '@/utils/apiErrorMessage'
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
  /** 为 true 时不弹出全局错误 toast（用于音乐页后台刷新等） */
  silent?: boolean
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
  silent,
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
      if (!silent) {
        authStore.removeToken()
        window.location.reload()
      }
      const loginMsg = formatApiErrorMessage(res.data, { url, httpStatus: 401 })
      return Promise.reject({ ...res.data, message: loginMsg })
    }

    const bizMsg = formatApiErrorMessage(res.data, { url, httpStatus: Number(code) })
    if (!silent) ms.error(bizMsg)
    return Promise.reject({ ...res.data, message: bizMsg })
  }

  const failHandler = (error: any) => {
    const authStore = useAuthStore()
    let data: any = ''
    if (error?.response?.data) {
      data = error.response.data
    }
    afterRequest?.()
    const status = error?.response?.status
    const reqUrl = String(error?.config?.url || error?.request?.responseURL || url || '')

    if (status === 401) {
      if (!silent) {
        authStore.removeToken()
        if (!hasWhitePath(error?.request?.responseURL)) {
          authStore.loadInit && authStore.setLoginDialog(true)
          const loginMsg = formatApiErrorMessage(data, {
            url: reqUrl,
            httpStatus: status,
            fallbackKey: 'common.unauthorizedTips',
          })
          if (Date.now() - last401ErrorTimestamp > 3000) {
            ms.error(loginMsg)
          }
        }
        last401ErrorTimestamp = Date.now()
      }
      throw new Error(
        formatApiErrorMessage(data, {
          url: reqUrl,
          httpStatus: status,
          fallbackKey: 'common.unauthorizedTips',
        })
      )
    }

    if (status === 413) {
      const msg = t('drawing.mjPayloadTooLarge')
      if (!silent) ms.error(msg)
      throw new Error(msg)
    }

    const msg = formatApiErrorMessage(data, { url: reqUrl, httpStatus: status })
    if (!silent && data && typeof data === 'object' && !data?.success) {
      ms.error(msg)
    }
    throw new Error(msg)
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
  silent,
}: HttpOption): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
    silent,
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
  silent,
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
    silent,
  })
}

export default post
