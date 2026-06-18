import { get, post } from '@/utils/request'
import service from '@/utils/request/axios'
import { xhrMultipartUpload, type XhrUploadProgressHandler } from '@/utils/xhrMultipartUpload'

export interface SunoMusicModel {
  model: string
  modelName: string
  deduct?: number
  deductType?: number
  drawingType?: number
  modelAvatar?: string
}

export interface SunoGenerateResult {
  clips?: { id: string; status?: string }[]
  request_id?: string
  [key: string]: unknown
}

export function fetchSunoMusicModelsListAPI<T = { list: SunoMusicModel[] }>() {
  return get<T>({ url: '/models/musicList' })
}

export function sunoGenerateAPI(data: {
  model: string
  payload: Record<string, unknown>
  chargeMult?: number
}) {
  return post<SunoGenerateResult>({ url: '/music/suno/generate', data })
}

export function sunoLyricsSubmitAPI(data: { model: string; prompt: string; chargeMult?: number }) {
  return post<{ task_id?: string }>({ url: '/music/suno/lyrics/submit', data })
}

export function sunoLyricsFetchAPI(model: string, taskId: string) {
  return get<{
    task_id?: string
    text?: string
    title?: string
    status?: 'pending' | 'complete' | 'error'
    fail_reason?: string
  }>({
    url: `/music/suno/lyrics/fetch/${encodeURIComponent(taskId)}`,
    data: { model },
  })
}

export function sunoFeedAPI(model: string, clipsIds: string, options?: { silent?: boolean }) {
  const ids = encodeURIComponent(clipsIds)
  return get<unknown>({
    url: `/music/suno/feed/${ids}`,
    data: { model },
    silent: options?.silent,
  })
}

export function sunoExpandTagsAPI(model: string, original_tags: string) {
  return post<{ upsampled_tags?: string }>({
    url: '/music/suno/act/tags',
    data: { model, original_tags },
  })
}

export function sunoGetMidiAPI(model: string, clipId: string) {
  return get<unknown>({
    url: `/music/suno/act/midi/${encodeURIComponent(clipId)}`,
    data: { model },
  })
}

export type SunoUploadProgressHandler = XhrUploadProgressHandler

export async function sunoUploadAudioAPI(
  model: string,
  file: File,
  onProgress?: SunoUploadProgressHandler
) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', model)
  return xhrMultipartUpload<unknown>({
    path: '/music/suno/upload',
    formData: fd,
    timeoutMs: 120_000,
    onProgress: onProgress
      ? (loaded, total) => onProgress(loaded, total > 0 ? total : file.size)
      : undefined,
  })
}

export async function sunoUploadPipelineAPI(
  model: string,
  file: File,
  onProgress?: SunoUploadProgressHandler
) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', model)
  return xhrMultipartUpload<unknown>({
    path: '/music/suno/upload/pipeline',
    formData: fd,
    timeoutMs: 180_000,
    onProgress: onProgress
      ? (loaded, total) => onProgress(loaded, total > 0 ? total : file.size)
      : undefined,
  })
}

export interface SunoMusicJobDto {
  id?: number
  clientKey?: number | string
  clipId?: string
  modelKey: string
  sceneLabel?: string
  promptLabel: string
  status?: string
  loading?: boolean
  error?: string
  clip?: Record<string, unknown>
  deductCharged?: number
  chargeMult?: number
  deductTypeSnapshot?: number
}

export function fetchSunoMusicJobsAPI(limit = 80, options?: { silent?: boolean }) {
  return get<{ list: SunoMusicJobDto[]; syncSeq: number }>({
    url: '/music/suno/jobs',
    data: { limit },
    silent: options?.silent,
  })
}

export function batchUpsertSunoMusicJobsAPI(data: {
  jobs: SunoMusicJobDto[]
  baseSyncSeq?: number
}) {
  return post<{ synced: number; stale?: boolean; syncSeq: number }>({
    url: '/music/suno/jobs/batch-upsert',
    data,
  })
}

export function deleteSunoMusicJobAPI(serverJobId: number) {
  return service.delete(`/music/suno/jobs/${serverJobId}`)
}

export function sunoConcatAPI(model: string, clip_id: string, is_infill?: boolean) {
  return post<unknown>({
    url: '/music/suno/submit/concat',
    data: { model, clip_id, is_infill: is_infill === true },
  })
}

export function sunoPersonaCreateAPI(data: {
  model: string
  root_clip_id: string
  name: string
  description: string
  clips: string[]
  is_public?: boolean
}) {
  return post<{ id?: string }>({ url: '/music/suno/persona/create', data })
}

export function sunoGetWavAPI(model: string, clipId: string) {
  return get<{ wav_file_url?: string }>({
    url: `/music/suno/act/wav/${encodeURIComponent(clipId)}`,
    data: { model },
  })
}

export function sunoGetMp4API(model: string, clipId: string) {
  return get<{ mp4?: string }>({
    url: `/music/suno/act/mp4/${encodeURIComponent(clipId)}`,
    data: { model },
  })
}

export function sunoGetTimingAPI(model: string, clipId: string) {
  return get<unknown>({
    url: `/music/suno/act/timing/${encodeURIComponent(clipId)}`,
    data: { model },
  })
}

export function sunoUploadByUrlAPI(model: string, url: string) {
  return post<unknown>({ url: '/music/suno/upload/url', data: { model, url } })
}

export function sunoFetchBatchAPI(model: string, ids: string[], action = 'MUSIC') {
  return post<unknown>({ url: '/music/suno/fetch/batch', data: { model, ids, action } })
}

export function sunoGetVoxAPI(
  model: string,
  clipId: string,
  vocal_start_s: number,
  vocal_end_s: number
) {
  return post<{ vocal_audio_url?: string }>({
    url: `/music/suno/act/vox/${encodeURIComponent(clipId)}`,
    data: { model, vocal_start_s, vocal_end_s },
  })
}
