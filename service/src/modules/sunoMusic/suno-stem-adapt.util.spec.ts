import { adaptStemPayloadForSubmitFlavor } from './suno-stem-adapt.util';

describe('adaptStemPayloadForSubmitFlavor', () => {
  it('converts vocal-stems to gen_stem on submit flavor', () => {
    const out = adaptStemPayloadForSubmitFlavor('submit', {
      clip_id: 'clip-1',
      task: 'vocal-stems',
    });
    expect(out.task).toBe('gen_stem');
    expect(out.continue_clip_id).toBe('clip-1');
    expect(out.stem_task).toBe('two');
    expect(out.mv).toBe('chirp-fenix');
  });

  it('converts all-stems to gen_stem twelve', () => {
    const out = adaptStemPayloadForSubmitFlavor('submit', {
      clip_id: 'clip-2',
      task: 'all-stems',
    });
    expect(out.stem_task).toBe('twelve');
  });

  it('leaves vocal-stems unchanged on generate flavor', () => {
    const out = adaptStemPayloadForSubmitFlavor('generate', {
      clip_id: 'clip-1',
      task: 'vocal-stems',
    });
    expect(out.task).toBe('vocal-stems');
  });
});
