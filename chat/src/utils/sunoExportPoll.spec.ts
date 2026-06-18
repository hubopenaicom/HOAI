import {
  extractMidiState,
  extractMp4Url,
  extractWavUrl,
  parseMidiInstruments,
  pollUntil,
} from '@/utils/sunoExportPoll'

describe('extractWavUrl', () => {
  it('reads wav_file_url', () => {
    expect(extractWavUrl({ wav_file_url: 'https://cdn/a.wav' })).toBe('https://cdn/a.wav')
  })
})

describe('extractMp4Url', () => {
  it('reads mp4 field', () => {
    expect(extractMp4Url({ mp4: 'https://cdn/v.mp4' })).toBe('https://cdn/v.mp4')
  })
})

describe('parseMidiInstruments', () => {
  it('reads top-level instruments', () => {
    expect(parseMidiInstruments({ instruments: [{ name: 'Piano', notes: [] }] })).toHaveLength(1)
  })
  it('reads nested data.instruments', () => {
    expect(parseMidiInstruments({ data: { instruments: [{ name: 'Guitar' }] } })).toHaveLength(1)
  })
})

describe('extractMidiState', () => {
  it('detects complete with instruments', () => {
    expect(extractMidiState({ instruments: [{ pitch: 60 }] }).state).toBe('complete')
  })
  it('detects error', () => {
    expect(extractMidiState({ state: 'error' }).state).toBe('error')
  })
})

describe('pollUntil', () => {
  it('returns when isReady on first attempt', async () => {
    const result = await pollUntil(
      async () => ({ ready: true }),
      r => r.ready === true,
      undefined,
      { maxAttempts: 3, intervalMs: 1 }
    )
    expect(result.ready).toBe(true)
  })

  it('throws export_timeout after max attempts', async () => {
    await expect(
      pollUntil(
        async () => ({ ready: false }),
        r => r.ready === true,
        undefined,
        { maxAttempts: 2, intervalMs: 1 }
      )
    ).rejects.toThrow('export_timeout')
  })
})
