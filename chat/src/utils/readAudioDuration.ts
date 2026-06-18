/** 从本地音频文件读取时长（秒），带超时与 MP3 快速解析，避免 Audio 元数据永久挂起 */

const MPEG1_LAYER3_SAMPLE_RATES = [44100, 48000, 32000, 0]
const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]

export interface ReadAudioDurationResult {
  durationSec?: number
  /** 使用 Audio 元数据且超时未得到结果 */
  timedOut?: boolean
  /** 解析来源 */
  source?: 'mp3-header' | 'audio-element'
}

function id3v2TagSize(buf: Uint8Array): number {
  if (buf.length < 10) return 0
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0
  return (
    10 +
    (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f))
  )
}

function isMp3Sync(buf: Uint8Array, i: number): boolean {
  return i + 1 < buf.length && buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0
}

/** 解析 MP3 Xing/Info 或 CBR 估算，通常毫秒级完成 */
export function parseMp3DurationSec(buf: Uint8Array, fileSize: number): number | undefined {
  let i = id3v2TagSize(buf)
  const limit = Math.min(buf.length - 4, i + 256 * 1024)
  while (i < limit) {
    if (!isMp3Sync(buf, i)) {
      i++
      continue
    }
    const ver = (buf[i + 1] >> 3) & 3
    const layer = (buf[i + 1] >> 1) & 3
    if (layer !== 1) {
      i++
      continue
    }
    const isMpeg1 = ver === 3
    const sampleIdx = (buf[i + 2] >> 2) & 3
    const sampleRate = MPEG1_LAYER3_SAMPLE_RATES[sampleIdx]
    if (!sampleRate) {
      i++
      continue
    }
    const sideInfoLen = isMpeg1 ? 32 : 17
    const xingOff = i + 4 + sideInfoLen
    if (xingOff + 16 <= buf.length) {
      const tag = String.fromCharCode(
        buf[xingOff],
        buf[xingOff + 1],
        buf[xingOff + 2],
        buf[xingOff + 3]
      )
      if (tag === 'Xing' || tag === 'Info') {
        const flags =
          (buf[xingOff + 4] << 24) |
          (buf[xingOff + 5] << 16) |
          (buf[xingOff + 6] << 8) |
          buf[xingOff + 7]
        if (flags & 1) {
          const frames =
            (buf[xingOff + 8] << 24) |
            (buf[xingOff + 9] << 16) |
            (buf[xingOff + 10] << 8) |
            buf[xingOff + 11]
          const samplesPerFrame = isMpeg1 ? 1152 : 576
          const sec = (frames * samplesPerFrame) / sampleRate
          if (Number.isFinite(sec) && sec > 0) return sec
        }
      }
    }
    const bitrateIdx = (buf[i + 2] >> 4) & 0xf
    const bitrateKbps = MPEG1_LAYER3_BITRATES[bitrateIdx]
    if (bitrateKbps > 0 && fileSize > 0) {
      const sec = (fileSize * 8) / (bitrateKbps * 1000)
      if (Number.isFinite(sec) && sec > 0) return sec
    }
    i += 4
  }
  return undefined
}

async function tryReadMp3Duration(file: File): Promise<number | undefined> {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (!name.endsWith('.mp3') && type !== 'audio/mpeg' && type !== 'audio/mp3') return undefined
  const headLen = Math.min(file.size, 512 * 1024)
  if (headLen <= 0) return undefined
  const buf = new Uint8Array(await file.slice(0, headLen).arrayBuffer())
  return parseMp3DurationSec(buf, file.size)
}

function readViaAudioElement(file: File, timeoutMs: number): Promise<ReadAudioDurationResult> {
  return new Promise(resolve => {
    let settled = false
    const finish = (result: ReadAudioDurationResult) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      audio.src = ''
      audio.onloadedmetadata = null
      audio.onerror = null
      resolve(result)
    }
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    const timer = window.setTimeout(() => {
      finish({ timedOut: true, source: 'audio-element' })
    }, timeoutMs)
    audio.onloadedmetadata = () => {
      const sec = audio.duration
      finish({
        durationSec: Number.isFinite(sec) ? sec : undefined,
        source: 'audio-element',
      })
    }
    audio.onerror = () => {
      finish({ source: 'audio-element' })
    }
    audio.src = url
    audio.load()
  })
}

/** 读取音频时长；MP3 优先走文件头解析，其余走 Audio 元数据（带超时） */
export async function readAudioDurationSec(
  file: File,
  timeoutMs = 4500
): Promise<ReadAudioDurationResult> {
  try {
    const mp3Sec = await tryReadMp3Duration(file)
    if (mp3Sec != null) {
      return { durationSec: mp3Sec, source: 'mp3-header' }
    }
  } catch {
    /* 快速解析失败则回退 Audio */
  }
  return readViaAudioElement(file, timeoutMs)
}
