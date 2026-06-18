import { t } from '@/locales'
import { formatSunoMusicError, rawSunoErrorMessage } from '@/utils/sunoErrorMessage'

export interface ApiErrorPayload {
  code?: number | string
  message?: string | null
  msg?: string | null
  success?: boolean
}

function extractRawMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const o = data as ApiErrorPayload
  return String(o.message ?? o.msg ?? '').trim()
}

/** 是否为音乐页后台静默请求可忽略的错误（过期 clip、记录不存在等） */
export function isBenignMusicBackgroundError(data: unknown): boolean {
  const raw = extractRawMessage(data) || rawSunoErrorMessage(data)
  const text = raw.toLowerCase()
  if (!text) return false
  return (
    text.includes('record not found') ||
    text.includes('clip not found') ||
    text.includes('找不到该曲目') ||
    text.includes('找不到对应记录') ||
    text.includes('不存在')
  )
}

/**
 * 将接口错误体格式化为用户可见中文。
 * 音乐相关错误优先走 sunoErrorMessage 规则。
 */
export function formatApiErrorMessage(
  data: unknown,
  options?: { url?: string; httpStatus?: number; fallbackKey?: string }
): string {
  const raw = extractRawMessage(data) || rawSunoErrorMessage(data)
  const url = options?.url ?? ''
  const isMusicApi = /\/music\/|\/models\/musicList/i.test(url)

  if (isMusicApi && raw) {
    const mapped = formatSunoMusicError(
      { message: raw },
      options?.fallbackKey ?? 'music.generateFail'
    )
    if (mapped !== raw) return mapped
  }

  if (raw) {
    const musicMapped = formatSunoMusicError(
      { message: raw },
      options?.fallbackKey ?? 'music.generateFail'
    )
    if (musicMapped !== raw) return musicMapped
    if (/[\u4e00-\u9fff]/.test(raw)) return raw
  }

  const status = options?.httpStatus ?? Number((data as ApiErrorPayload)?.code)
  if (status === 502 || status === 504) return t('music.errorUpstreamUnavailable')
  if (status === 413) return t('drawing.mjPayloadTooLarge')

  return raw || t(options?.fallbackKey ?? 'common.wrong')
}
