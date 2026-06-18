import { SUNO_POLL_INTERVAL_MS } from '@/utils/sunoFeedParse'

export interface PollOptions<T> {
  intervalMs?: number
  maxAttempts?: number
  initialDelayMs?: number
  onProgress?: (attempt: number, max: number) => void
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export async function pollUntil<T>(
  fetchFn: () => Promise<T>,
  isReady: (result: T) => boolean,
  isError?: (result: T) => boolean,
  options: PollOptions<T> = {}
): Promise<T> {
  const intervalMs = options.intervalMs ?? SUNO_POLL_INTERVAL_MS
  const maxAttempts = options.maxAttempts ?? 30
  if (options.initialDelayMs && options.initialDelayMs > 0) {
    await sleep(options.initialDelayMs)
  }
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await sleep(intervalMs)
    options.onProgress?.(i + 1, maxAttempts)
    const result = await fetchFn()
    if (isError?.(result)) throw new Error('export_error')
    if (isReady(result)) return result
  }
  throw new Error('export_timeout')
}

export function extractWavUrl(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const o = body as Record<string, unknown>
  const url = o.wav_file_url ?? o.wav_url ?? o.url
  const s = url != null ? String(url).trim() : ''
  return s || undefined
}

export function extractMp4Url(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const o = body as Record<string, unknown>
  const url = o.mp4 ?? o.mp4_url ?? o.video_url ?? o.url
  const s = url != null ? String(url).trim() : ''
  return s || undefined
}

export function extractMidiState(body: unknown): {
  state: string
  data?: unknown
} {
  if (!body || typeof body !== 'object') return { state: '' }
  const o = body as Record<string, unknown>
  const state = String(o.state ?? '').toLowerCase()
  if (state === 'complete') return { state: 'complete', data: body }
  if (state === 'error' || state === 'failed') return { state: 'error' }
  if (state === 'running' || state === 'processing') return { state: 'running' }
  if (parseMidiInstruments(body).length > 0) return { state: 'complete', data: body }
  return { state }
}

export interface MidiNote {
  pitch?: number
  start?: number
  end?: number
  velocity?: number
}

export interface MidiInstrument {
  name?: string
  notes?: MidiNote[]
}

export function parseMidiInstruments(data: unknown): MidiInstrument[] {
  if (!data || typeof data !== 'object') return []
  const o = data as Record<string, unknown>
  if (Array.isArray(o.instruments)) return o.instruments as MidiInstrument[]
  const nested = o.data
  if (nested && typeof nested === 'object') {
    const inner = nested as Record<string, unknown>
    if (Array.isArray(inner.instruments)) return inner.instruments as MidiInstrument[]
  }
  return []
}

export function extractMidiDownloadUrl(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const o = data as Record<string, unknown>
  for (const key of ['midi_url', 'midi_file_url', 'url', 'download_url']) {
    const s = o[key] != null ? String(o[key]).trim() : ''
    if (!s) continue
    if (/\.mid(i)?(\?|$)/i.test(s) || key.includes('midi')) return s
  }
  return undefined
}

export async function pollWavUrl(
  fetchFn: () => Promise<unknown>,
  options?: PollOptions<unknown>
): Promise<string> {
  const body = await pollUntil(fetchFn, b => !!extractWavUrl(b), undefined, {
    maxAttempts: 30,
    ...options,
  })
  const url = extractWavUrl(body)
  if (!url) throw new Error('export_timeout')
  return url
}

export async function pollMp4Url(
  fetchFn: () => Promise<unknown>,
  options?: PollOptions<unknown>
): Promise<string> {
  const body = await pollUntil(
    fetchFn,
    b => !!extractMp4Url(b),
    b => {
      const o = b as Record<string, unknown>
      const err = String(o.error ?? o.message ?? '').toLowerCase()
      return err.includes('fail') || err.includes('error')
    },
    { maxAttempts: 15, initialDelayMs: 30_000, intervalMs: SUNO_POLL_INTERVAL_MS, ...options }
  )
  const url = extractMp4Url(body)
  if (!url) throw new Error('export_timeout')
  return url
}

export async function pollMidiComplete(
  fetchFn: () => Promise<unknown>,
  options?: PollOptions<unknown>
): Promise<unknown> {
  const body = await pollUntil(
    fetchFn,
    b => extractMidiState(b).state === 'complete',
    b => extractMidiState(b).state === 'error',
    { maxAttempts: 45, ...options }
  )
  return extractMidiState(body).data ?? body
}

export function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
