/** 从 clipJson 解析音乐工作室持久化元数据（与前端 sunoJobCloud 对齐） */

export interface SunoJobStudioMeta {
  taskId?: string;
  isUploadClip?: boolean;
  parentClipId?: string;
  stemGroupId?: string;
  stemKind?: string;
}

export function extractStudioMetaFromClip(clip?: Record<string, unknown>): SunoJobStudioMeta {
  if (!clip || typeof clip !== 'object') return {};
  const studio =
    clip.music_studio && typeof clip.music_studio === 'object' && !Array.isArray(clip.music_studio)
      ? (clip.music_studio as Record<string, unknown>)
      : {};

  const taskId = String(studio.taskId ?? clip.task_id ?? '').trim() || undefined;
  const parentClipId = String(studio.parentClipId ?? clip.parent_clip_id ?? '').trim() || undefined;
  const stemGroupId = String(studio.stemGroupId ?? clip.stem_group_id ?? '').trim() || undefined;
  const stemKind = String(studio.stemKind ?? clip.stem_kind ?? '').trim() || undefined;
  const isUploadClip = Boolean(studio.isUploadClip ?? clip.is_upload);

  return {
    taskId,
    isUploadClip: isUploadClip || undefined,
    parentClipId,
    stemGroupId,
    stemKind,
  };
}
