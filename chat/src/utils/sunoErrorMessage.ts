import { t } from '@/locales'

export type SunoMusicErrorKind =
  | 'catalog'
  | 'timeout'
  | 'size'
  | 'concat_job'
  | 'persona_upload'
  | 'clip_not_found'
  | 'generic'

interface ErrorPattern {
  test: RegExp
  key: string
  kind: SunoMusicErrorKind
}

/** 顺序敏感：更具体的规则放前面 */
const PATTERNS: ErrorPattern[] = [
  {
    test: /matches an existing recording|existing recording in our catalog|版权|曲库|catalog\s*match/i,
    key: 'music.errorUploadCatalogMatch',
    kind: 'catalog',
  },
  {
    test: /job\s+not\s+exi|job\s+does\s+not\s+exi|任务不存在|续写.*后.*拼接/i,
    key: 'music.errorConcatJobNotFound',
    kind: 'concat_job',
  },
  {
    test: /非\s*uploader|non.?uploader|cannot.*persona.*upload|persona.*upload\s+clip/i,
    key: 'music.errorPersonaUploadClip',
    kind: 'persona_upload',
  },
  {
    test: /insufficient|balance|积分|余额|不足/i,
    key: 'music.errorInsufficientBalance',
    kind: 'generic',
  },
  {
    test: /rate\s*limit|too\s*many\s*request|请求过于频繁/i,
    key: 'music.errorRateLimit',
    kind: 'generic',
  },
  {
    test: /unauthorized|invalid.*api\s*key|401|鉴权|密钥/i,
    key: 'music.errorUnauthorized',
    kind: 'generic',
  },
  {
    test: /timeout|timed\s*out|超时|gateway\s*timeout|504/i,
    key: 'music.errorTimeout',
    kind: 'timeout',
  },
  {
    test: /html\s*而非\s*json|proxyurl|SUNO_API_FLAVOR|上游返回了网页/i,
    key: 'music.errorUpstreamHtml',
    kind: 'generic',
  },
  {
    test: /file\s*too\s*large|payload\s*too\s*large|50\s*mb|50mb|文件过大|超过.*大小/i,
    key: 'music.errorUploadFileTooLarge',
    kind: 'size',
  },
  {
    test: /is not defined|is not a function|referenceerror/i,
    key: 'music.errorClientStale',
    kind: 'generic',
  },
  {
    test: /upload_no_clip_id/i,
    key: 'music.uploadNoClipId',
    kind: 'generic',
  },
  {
    test: /record\s+not\s+found|找不到对应记录|找不到该曲目记录/i,
    key: 'music.errorRecordNotFound',
    kind: 'clip_not_found',
  },
  {
    test: /clip\s*not\s*found|找不到该曲目|clip_id\s*无效/i,
    key: 'music.errorClipNotFound',
    kind: 'clip_not_found',
  },
  {
    test: /120\s*秒|less than 120|超过.*时长|too long|duration/i,
    key: 'music.errorUploadTooLong',
    kind: 'generic',
  },
  {
    test: /502|bad\s*gateway|上游.*不可用|upstream.*unavailable/i,
    key: 'music.errorUpstreamUnavailable',
    kind: 'generic',
  },
  {
    test: /model.*not\s*found|模型不存在|未配置/i,
    key: 'music.errorModelNotFound',
    kind: 'generic',
  },
]

export function rawSunoErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.trim()
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const msg = String(o.message ?? o.msg ?? '').trim()
    if (msg) return msg
  }
  if (typeof e === 'string') return e.trim()
  return ''
}

export function classifySunoMusicError(raw: string): SunoMusicErrorKind {
  const text = raw.trim()
  if (!text) return 'generic'
  for (const p of PATTERNS) {
    if (p.test.test(text)) return p.kind
  }
  return 'generic'
}

export function sunoMusicErrorKind(e: unknown): SunoMusicErrorKind {
  return classifySunoMusicError(rawSunoErrorMessage(e))
}

/** 将上游/网络错误映射为友好 i18n 文案，无法识别时回退原文或 fallbackKey */
export function formatSunoMusicError(e: unknown, fallbackKey = 'music.generateFail'): string {
  const raw = rawSunoErrorMessage(e)
  if (raw === 'export_timeout') return t('music.exportPending')
  for (const p of PATTERNS) {
    if (p.test.test(raw)) return t(p.key)
  }
  if (raw && raw.length <= 240 && !raw.includes('<html') && !raw.includes('<!doctype')) {
    return raw
  }
  return t(fallbackKey)
}
