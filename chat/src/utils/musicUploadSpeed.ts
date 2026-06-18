/** 上传速率平滑采样（指数移动平均） */
export class MusicUploadSpeedTracker {
  private lastLoaded = 0
  private lastTs = 0
  private smoothedBps = 0

  reset() {
    this.lastLoaded = 0
    this.lastTs = 0
    this.smoothedBps = 0
  }

  sample(
    loaded: number,
    total: number
  ): { loadedBytes: number; totalBytes: number; bytesPerSecond: number } {
    const now = performance.now()
    if (this.lastTs > 0) {
      const dtSec = (now - this.lastTs) / 1000
      const delta = loaded - this.lastLoaded
      if (dtSec >= 0.08 && delta >= 0) {
        const instant = delta / dtSec
        this.smoothedBps = this.smoothedBps > 0 ? this.smoothedBps * 0.65 + instant * 0.35 : instant
      }
    }
    this.lastLoaded = loaded
    this.lastTs = now
    return {
      loadedBytes: loaded,
      totalBytes: total,
      bytesPerSecond: Math.max(0, Math.round(this.smoothedBps)),
    }
  }
}

export function formatUploadBytes(n: number): string {
  const v = Math.max(0, n)
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(2)} MB`
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${Math.round(v)} B`
}

export function formatUploadSpeed(bps: number): string {
  const v = Math.max(0, bps)
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(2)} MB/s`
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB/s`
  return `${Math.round(v)} B/s`
}

/** 剩余秒数（向上取整）；无法估算时返回 undefined */
export function estimateUploadEtaSec(
  loaded: number,
  total: number,
  bytesPerSecond: number
): number | undefined {
  if (!Number.isFinite(total) || total <= 0 || bytesPerSecond <= 0) return undefined
  const remain = total - loaded
  if (remain <= 0) return 0
  return Math.ceil(remain / bytesPerSecond)
}
