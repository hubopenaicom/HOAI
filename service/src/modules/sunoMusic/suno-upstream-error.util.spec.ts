import { humanizeSunoUpstreamError, isBenignSunoFeedMiss } from './suno-upstream-error.util';

describe('suno-upstream-error.util', () => {
  it('detects benign feed miss', () => {
    expect(isBenignSunoFeedMiss('record not found')).toBe(true);
    expect(isBenignSunoFeedMiss('clip not found')).toBe(true);
    expect(isBenignSunoFeedMiss('insufficient balance')).toBe(false);
  });

  it('humanizes record not found', () => {
    const msg = humanizeSunoUpstreamError('record not found', 502);
    expect(msg).toContain('找不到');
    expect(msg).not.toContain('record not found');
  });
});
