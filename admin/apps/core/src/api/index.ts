import router from '@/router/index'
import axios from 'axios'
import { ElMessage } from 'element-plus'

declare module 'axios' {
  export interface AxiosRequestConfig {
    fake?: boolean
  }
}

function isEnvTruthy(v: unknown) {
  return v === true || String(v) === 'true'
}

function enableDevProxy(): boolean {
  if (!import.meta.env.DEV)
    return false
  return isEnvTruthy(import.meta.env.VITE_ENABLE_PROXY) || isEnvTruthy(import.meta.env.VITE_OPEN_PROXY)
}

const api = axios.create({
  baseURL: enableDevProxy()
    ? '/proxy/'
    : import.meta.env.VITE_APP_API_BASEURL,
  timeout: 1000 * 60,
  responseType: 'json',
})

api.interceptors.request.use((request) => {
  const appAccountStore = useAppAccountStore()
  if (appAccountStore.isLogin && request.headers) {
    request.headers.Authorization = appAccountStore.token ? `Bearer ${appAccountStore.token}` : ''
  }
  if (request.method === 'post') {
    // 可按需对 POST 参数序列化
  }
  return request
})

api.interceptors.response.use(
  (response) => {
    return Promise.resolve(response.data)
  },
  (error) => {
    let msg = ''
    if (error?.response) {
      const { data, status } = error.response
      if (status === 401) {
        msg = '权限验证失败，请重新登录'
        if (data.code === 401 && data.message?.includes?.('请登录后继续操作')) {
          const appAccountStore = useAppAccountStore()
          appAccountStore.logout().then(() => {
            router.push({ name: 'login' })
          })
        }
      }
      const { message } = data
      message && (msg = message)
    }
    else {
      msg = '接口请求异常，请稍后再试'
    }

    ElMessage({
      message: msg,
      type: 'error',
    })
    return Promise.reject(error)
  },
)

export default api
