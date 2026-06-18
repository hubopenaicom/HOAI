import {
  extractClipsFromSunoFetchTask,
  extractLyricsFromSunoFetchTask,
  extractSunoClipsFromBody,
  extractSunoPersonaId,
  isLikelySunoClipId,
} from './suno-response.util';

describe('suno-response.util', () => {
  describe('isLikelySunoClipId', () => {
    it('accepts uuid clip ids', () => {
      expect(isLikelySunoClipId('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(true);
    });
    it('rejects html fragments', () => {
      expect(isLikelySunoClipId('<html>')).toBe(false);
    });
  });

  describe('extractSunoClipsFromBody', () => {
    it('unwraps envelope with clips array', () => {
      const out = extractSunoClipsFromBody({
        code: 'success',
        data: { clips: [{ id: 'clip-1', status: 'submitted' }] },
      });
      expect(out).toEqual([{ id: 'clip-1', status: 'submitted' }]);
    });
    it('parses single clip id string', () => {
      const out = extractSunoClipsFromBody({
        code: 'success',
        data: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      });
      expect(out[0]?.id).toBe('a1b2c3d4-e5f6-4789-a012-3456789abcde');
    });
  });

  describe('extractClipsFromSunoFetchTask', () => {
    it('returns songs from nested data', () => {
      const rows = extractClipsFromSunoFetchTask({
        code: 'success',
        data: {
          status: 'SUCCESS',
          data: [{ id: 'song-1', status: 'complete', title: 'Test' }],
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('song-1');
      expect(rows[0].status).toBe('complete');
    });
    it('throws on failure status', () => {
      expect(() =>
        extractClipsFromSunoFetchTask({
          status: 'FAILURE',
          fail_reason: 'quota exceeded',
        }),
      ).toThrow(/quota exceeded/i);
    });
  });

  describe('extractLyricsFromSunoFetchTask', () => {
    it('returns complete lyrics', () => {
      const r = extractLyricsFromSunoFetchTask({
        task_id: 't1',
        status: 'SUCCESS',
        data: { text: 'hello world', title: 'Hi' },
      });
      expect(r.status).toBe('complete');
      expect(r.text).toBe('hello world');
    });
  });

  describe('extractSunoPersonaId', () => {
    it('reads persona id from envelope', () => {
      expect(extractSunoPersonaId({ code: 'ok', data: { id: 'persona-99' } })).toBe('persona-99');
    });
  });
});
