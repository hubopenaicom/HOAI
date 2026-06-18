import { describe, expect, it } from 'vitest'
import {
  estimateUploadEtaSec,
  formatUploadBytes,
  formatUploadSpeed,
  MusicUploadSpeedTracker,
} from './musicUploadSpeed'

describe('musicUploadSpeed', () => {
  it('formats bytes and speed', () => {
    expect(formatUploadBytes(1536)).toBe('1.5 KB')
    expect(formatUploadBytes(3.5 * 1024 * 1024)).toMatch(/MB/)
    expect(formatUploadSpeed(512000)).toMatch(/KB\/s/)
  })

  it('tracks loaded bytes', () => {
    const tr = new MusicUploadSpeedTracker()
    tr.reset()
    const a = tr.sample(0, 1000)
    expect(a.bytesPerSecond).toBe(0)
    const b = tr.sample(100000, 1000000)
    expect(b.loadedBytes).toBe(100000)
    expect(b.totalBytes).toBe(1000000)
  })

  it('estimates eta', () => {
    expect(estimateUploadEtaSec(500, 1000, 100)).toBe(5)
    expect(estimateUploadEtaSec(1000, 1000, 100)).toBe(0)
  })
})
