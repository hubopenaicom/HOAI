/** 音乐上传进度：准备 → 传输 → 服务端/上游处理 → feed 轮询 */

export type MusicUploadPhase = 'preparing' | 'analyzing' | 'transfer' | 'processing' | 'polling'

export interface MusicUploadProgressState {
  phase: MusicUploadPhase
  /** 0–100 */
  percent: number
  loadedBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
}

export const MUSIC_UPLOAD_POLL_MAX = 20

/** 各阶段在总进度条上的占比（与实测耗时大致匹配） */
export const MUSIC_UPLOAD_PROGRESS_WEIGHT = {
  preparing: 2,
  analyzingMax: 12,
  transferMax: 72,
  processing: 84,
  pollingStart: 86,
  pollingMax: 99,
  done: 100,
} as const

export function musicUploadPreparingPercent(): number {
  return MUSIC_UPLOAD_PROGRESS_WEIGHT.preparing
}

export function musicUploadAnalyzingPercent(elapsedMs: number): number {
  const { preparing, analyzingMax } = MUSIC_UPLOAD_PROGRESS_WEIGHT
  const span = analyzingMax - preparing
  const t = Math.min(1, elapsedMs / 8000)
  return Math.round(preparing + span * t)
}

export function musicUploadTransferPercent(loaded: number, total: number): number {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) {
    return MUSIC_UPLOAD_PROGRESS_WEIGHT.analyzingMax
  }
  const ratio = Math.min(1, Math.max(0, loaded / total))
  const span = MUSIC_UPLOAD_PROGRESS_WEIGHT.transferMax - MUSIC_UPLOAD_PROGRESS_WEIGHT.analyzingMax
  return Math.round(MUSIC_UPLOAD_PROGRESS_WEIGHT.analyzingMax + ratio * span)
}

/** 文件已传完、等待服务端响应时的缓动进度 */
export function musicUploadProcessingTickPercent(current: number): number {
  const { transferMax, processing } = MUSIC_UPLOAD_PROGRESS_WEIGHT
  const next = current + 0.6
  return Math.round(Math.min(processing - 1, Math.max(transferMax, next)))
}

export function musicUploadProcessingPercent(): number {
  return MUSIC_UPLOAD_PROGRESS_WEIGHT.processing
}

export function musicUploadPollingPercent(
  round: number,
  maxRounds = MUSIC_UPLOAD_POLL_MAX
): number {
  const { pollingStart, pollingMax } = MUSIC_UPLOAD_PROGRESS_WEIGHT
  const span = pollingMax - pollingStart
  const t = Math.min(1, Math.max(0, round / Math.max(1, maxRounds)))
  return Math.round(pollingStart + span * t)
}

export function musicUploadDonePercent(): number {
  return MUSIC_UPLOAD_PROGRESS_WEIGHT.done
}

export type UploadProgressReporter = (state: MusicUploadProgressState) => void

/** 分析本地音频元数据阶段的进度条（立即首帧 + 定时刷新） */
export function createMusicUploadAnalyzeTicker(
  report: UploadProgressReporter,
  totalBytes: number,
  intervalMs = 200
): () => void {
  const start = performance.now()
  const tick = () => {
    report({
      phase: 'analyzing',
      percent: musicUploadAnalyzingPercent(performance.now() - start),
      totalBytes,
      loadedBytes: 0,
      bytesPerSecond: 0,
    })
  }
  tick()
  const id = window.setInterval(tick, intervalMs)
  return () => window.clearInterval(id)
}
