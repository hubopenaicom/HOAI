import {
  clipContextFromFeed,
  mergeClipContextFromFeed,
  resolveClipContext,
} from '@/utils/sunoClipContext'
import type { MusicClipItem } from '@/types/music'

describe('clipContextFromFeed', () => {
  it('extracts task_id from metadata', () => {
    const ctx = clipContextFromFeed({
      id: 'c1',
      metadata: { task_id: 'task-meta', duration: 42, type: 'user_upload' },
    })
    expect(ctx.taskId).toBe('task-meta')
    expect(ctx.duration).toBe(42)
    expect(ctx.isUpload).toBe(true)
  })
})

describe('mergeClipContextFromFeed', () => {
  it('patches item with feed context', () => {
    const item: MusicClipItem = {
      id: 'l1',
      clipId: 'c1',
      title: 'T',
      status: 'streaming',
      createdAt: 1,
    }
    const patch = mergeClipContextFromFeed(item, {
      id: 'c1',
      task_id: 'tid',
      duration: 90,
    })
    expect(patch.taskId).toBe('tid')
    expect(patch.duration).toBe(90)
  })
})

describe('resolveClipContext', () => {
  it('merges from clips list', () => {
    const clips: MusicClipItem[] = [
      {
        id: 'l1',
        clipId: 'c1',
        title: 'T',
        status: 'complete',
        createdAt: 1,
        taskId: 'stored-task',
        isUploadClip: true,
      },
    ]
    const ctx = resolveClipContext('c1', clips)
    expect(ctx?.taskId).toBe('stored-task')
    expect(ctx?.isUpload).toBe(true)
  })
})
