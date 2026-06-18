import {
  clipToCloudJson,
  mapCloudMusicJobsToClips,
  parseCloudMusicJobsResponse,
  studioFieldsFromCloudClip,
} from '@/utils/sunoJobCloud'
import type { MusicClipItem } from '@/types/music'

describe('clipToCloudJson', () => {
  it('embeds music_studio metadata', () => {
    const item: MusicClipItem = {
      id: 'local-1',
      clipId: 'clip-1',
      title: 'T',
      status: 'complete',
      createdAt: 1,
      parentClipId: 'parent',
      stemKind: 'vocals',
      taskId: 'task-9',
      isUploadClip: true,
    }
    const json = clipToCloudJson(item)
    const studio = json.music_studio as Record<string, unknown>
    expect(studio.parentClipId).toBe('parent')
    expect(studio.stemKind).toBe('vocals')
    expect(studio.taskId).toBe('task-9')
    expect(studio.isUploadClip).toBe(true)
  })
})

describe('studioFieldsFromCloudClip', () => {
  it('round-trips music_studio block', () => {
    const fields = studioFieldsFromCloudClip({
      music_studio: {
        parentClipId: 'p1',
        stemGroupId: 'g1',
        stemKind: 'drums',
        taskId: 't1',
        isUploadClip: false,
      },
    })
    expect(fields.parentClipId).toBe('p1')
    expect(fields.stemKind).toBe('drums')
    expect(fields.taskId).toBe('t1')
  })
})

describe('parseCloudMusicJobsResponse', () => {
  const sampleList = [{ clipId: 'abc', promptLabel: 'Test', status: 'complete', clip: {} }]

  it('unwraps Nest Result envelope', () => {
    const out = parseCloudMusicJobsResponse({
      code: 200,
      success: true,
      data: { list: sampleList, syncSeq: 3 },
    })
    expect(out.list).toHaveLength(1)
    expect(out.syncSeq).toBe(3)
  })

  it('reads list from Response.data when body is not unwrapped', () => {
    const out = parseCloudMusicJobsResponse({
      success: true,
      data: { list: sampleList, syncSeq: 0 },
    })
    expect(out.list[0].clipId).toBe('abc')
  })
})

describe('mapCloudMusicJobsToClips', () => {
  it('maps server job rows to clip items', () => {
    const rows = [
      {
        id: 1,
        clientKey: 'job-1',
        clipId: 'd2873160-b635-4cd7-86c4-879cad7902b5',
        promptLabel: '不夜城',
        status: 'complete',
        sceneLabel: '场景1',
        createdAt: '2026-06-16T23:32:33.637Z',
        clip: {
          audio_url: 'https://cdn1.suno.ai/x.mp3',
          image_url: 'https://cdn2.suno.ai/x.jpeg',
          duration: 160.28,
        },
      },
    ]
    const clips = mapCloudMusicJobsToClips(rows)
    expect(clips).toHaveLength(1)
    expect(clips[0].title).toBe('不夜城')
    expect(clips[0].serverJobId).toBe(1)
    expect(clips[0].audioUrl).toContain('suno.ai')
    expect(clips[0].status).toBe('complete')
  })

  it('skips rows without clipId', () => {
    expect(mapCloudMusicJobsToClips([{ promptLabel: 'x', status: 'submitted' }])).toHaveLength(0)
  })

  it('restores pending variant slot with empty clipId but clientKey', () => {
    const clips = mapCloudMusicJobsToClips([
      {
        id: 9,
        clientKey: 'job-1781755040319-1',
        clipId: '',
        promptLabel: '晨光步调',
        status: 'queued',
        sceneLabel: '场景1·灵感',
        createdAt: '2026-06-18T12:00:00.000Z',
        clip: {},
      },
    ])
    expect(clips).toHaveLength(1)
    expect(clips[0].id).toBe('job-1781755040319-1')
    expect(clips[0].clipId).toBe('')
    expect(clips[0].status).toBe('queued')
  })
})
