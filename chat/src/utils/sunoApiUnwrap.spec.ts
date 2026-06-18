import { describe, expect, it } from 'vitest'
import { parseUploadClipId, parseUploadClipIdOrThrow, unwrapMusicApiData } from './sunoApiUnwrap'

describe('unwrapMusicApiData', () => {
  it('unwraps Nest Result with string data', () => {
    expect(
      unwrapMusicApiData({
        code: 200,
        success: true,
        data: '736a6f88-bd29-4b1e-b110-37132a5325ac',
      })
    ).toBe('736a6f88-bd29-4b1e-b110-37132a5325ac')
  })

  it('unwraps nested Suno envelope inside Nest Result', () => {
    expect(
      unwrapMusicApiData({
        code: 200,
        success: true,
        data: { code: 'success', data: 'task-token-abc' },
      })
    ).toBe('task-token-abc')
  })

  it('unwraps object clip payload', () => {
    expect(
      unwrapMusicApiData({
        code: 200,
        success: true,
        data: { clip_id: 'ca94a97d-d3f2-4a63-aeee-ba3a43384bcd', duration: 180.5 },
      })
    ).toEqual({ clip_id: 'ca94a97d-d3f2-4a63-aeee-ba3a43384bcd', duration: 180.5 })
  })
})

describe('parseUploadClipId', () => {
  it('parses task_id string from Nest Result', () => {
    expect(
      parseUploadClipId({
        code: 200,
        success: true,
        data: '736a6f88-bd29-4b1e-b110-37132a5325ac',
      })
    ).toBe('736a6f88-bd29-4b1e-b110-37132a5325ac')
  })

  it('parses clip_id object from pipeline', () => {
    expect(
      parseUploadClipId({
        code: 200,
        success: true,
        data: { clip_id: 'ca94a97d-d3f2-4a63-aeee-ba3a43384bcd' },
      })
    ).toBe('ca94a97d-d3f2-4a63-aeee-ba3a43384bcd')
  })

  it('parses nested suno envelope', () => {
    expect(
      parseUploadClipId({
        code: 'success',
        message: '',
        data: '736a6f88-bd29-4b1e-b110-37132a5325ac',
      })
    ).toBe('736a6f88-bd29-4b1e-b110-37132a5325ac')
  })

  it('throws upload_no_clip_id when empty', () => {
    expect(() => parseUploadClipIdOrThrow({ code: 200, success: true, data: {} })).toThrow(
      'upload_no_clip_id'
    )
  })
})
