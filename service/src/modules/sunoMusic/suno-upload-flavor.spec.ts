import { resolveSunoApiFlavor } from './suno-proxy.util';

describe('suno upload flavor', () => {
  it('ephone uses submit flavor (URL bridge, not multipart/S3 HTML paths)', () => {
    expect(resolveSunoApiFlavor('https://api.ephone.ai')).toBe('submit');
  });
});
