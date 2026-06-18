import { extractStudioMetaFromClip } from './suno-job-cloud.util';

describe('extractStudioMetaFromClip', () => {
  it('reads music_studio block', () => {
    const meta = extractStudioMetaFromClip({
      audio_url: 'https://cdn/a.mp3',
      music_studio: {
        taskId: 'task-99',
        isUploadClip: true,
        parentClipId: 'parent-1',
        stemGroupId: 'grp-1',
        stemKind: 'vocals',
      },
    });
    expect(meta.taskId).toBe('task-99');
    expect(meta.isUploadClip).toBe(true);
    expect(meta.parentClipId).toBe('parent-1');
    expect(meta.stemKind).toBe('vocals');
  });

  it('falls back to legacy top-level fields', () => {
    const meta = extractStudioMetaFromClip({
      task_id: 'legacy-task',
      parent_clip_id: 'p2',
      stem_kind: 'drums',
    });
    expect(meta.taskId).toBe('legacy-task');
    expect(meta.parentClipId).toBe('p2');
    expect(meta.stemKind).toBe('drums');
  });
});
