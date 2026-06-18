import {
  buildSunoUpstreamPath,
  lyricsFetchUpstreamPath,
  lyricsSubmitUpstreamPath,
  resolveSunoApiFlavor,
} from './suno-proxy.util';

describe('resolveSunoApiFlavor', () => {
  const prevFlavor = process.env.SUNO_API_FLAVOR;
  const prevMarkers = process.env.SUNO_SUBMIT_HOST_MARKERS;

  afterEach(() => {
    if (prevFlavor === undefined) delete process.env.SUNO_API_FLAVOR;
    else process.env.SUNO_API_FLAVOR = prevFlavor;
    if (prevMarkers === undefined) delete process.env.SUNO_SUBMIT_HOST_MARKERS;
    else process.env.SUNO_SUBMIT_HOST_MARKERS = prevMarkers;
  });

  it('respects SUNO_API_FLAVOR=submit', () => {
    process.env.SUNO_API_FLAVOR = 'submit';
    expect(resolveSunoApiFlavor('https://any.example.com')).toBe('submit');
  });

  it('detects ephone.ai as submit by default', () => {
    delete process.env.SUNO_API_FLAVOR;
    expect(resolveSunoApiFlavor('https://api.ephone.ai')).toBe('submit');
  });

  it('defaults to generate for unknown hosts', () => {
    delete process.env.SUNO_API_FLAVOR;
    expect(resolveSunoApiFlavor('https://api.gptgod.online')).toBe('generate');
  });
});

describe('buildSunoUpstreamPath', () => {
  it('maps generate to submit/music for ephone', () => {
    const { url, flavor } = buildSunoUpstreamPath('https://api.ephone.ai', '/suno/generate');
    expect(flavor).toBe('submit');
    expect(url).toBe('https://api.ephone.ai/suno/submit/music');
  });

  it('keeps generate path for generate flavor hosts', () => {
    process.env.SUNO_API_FLAVOR = 'generate';
    const { url } = buildSunoUpstreamPath('https://api.example.com', '/suno/generate');
    expect(url).toBe('https://api.example.com/suno/generate');
    delete process.env.SUNO_API_FLAVOR;
  });
});

describe('lyrics paths', () => {
  it('submit lyrics submit path', () => {
    expect(lyricsSubmitUpstreamPath('submit')).toBe('/suno/submit/lyrics');
  });
  it('generate lyrics fetch path', () => {
    expect(lyricsFetchUpstreamPath('generate', 'tid-1')).toBe('/suno/lyrics/tid-1');
  });
});
