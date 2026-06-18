import { describe, expect, it } from 'vitest'
import {
  musicUploadPollingPercent,
  musicUploadProcessingPercent,
  musicUploadTransferPercent,
} from './musicUploadProgress'

describe('musicUploadProgress', () => {
  it('maps transfer bytes to analyzing–72%', () => {
    expect(musicUploadTransferPercent(0, 1000)).toBe(12)
    expect(musicUploadTransferPercent(500, 1000)).toBe(42)
    expect(musicUploadTransferPercent(1000, 1000)).toBe(72)
  })

  it('uses fixed processing percent', () => {
    expect(musicUploadProcessingPercent()).toBe(84)
  })

  it('advances polling percent toward 99%', () => {
    expect(musicUploadPollingPercent(0)).toBe(86)
    expect(musicUploadPollingPercent(20)).toBe(99)
  })
})
