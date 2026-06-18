import type { MusicFormState } from '@/types/music'

/** 需要人声的创作模式（非纯音乐） */
export function isVocalCreateForm(form: MusicFormState): boolean {
  return (
    form.primaryTab === 'create' && (form.createMode === 'inspire' || form.createMode === 'custom')
  )
}

/** 提交歌词 API 时使用的主题描述 */
export function lyricsThemeFromForm(form: MusicFormState): string {
  if (form.createMode === 'inspire') return form.gptDescriptionPrompt.trim()
  if (!form.prompt.trim()) {
    return form.gptDescriptionPrompt.trim() || form.tags.trim()
  }
  return ''
}

/** 先歌词后成曲：音乐生成走场景 2（自定义） */
export function formForMusicGeneration(form: MusicFormState): MusicFormState {
  if (!isVocalCreateForm(form) || !form.useLyricsFirst) return form
  if (form.createMode === 'inspire') {
    return { ...form, createMode: 'custom' }
  }
  return form
}
