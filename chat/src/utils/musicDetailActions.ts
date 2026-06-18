import type { MusicEditMode, MusicProcessMode } from '@/types/music'

export type MusicDetailActionKind =
  | 'stem'
  | 'lyrics'
  | 'wav'
  | 'mp4'
  | 'timing'
  | 'midi'
  | 'vox'
  | 'concat'
  | 'wizard'
  | `edit:${MusicEditMode}`
  | `process:${MusicProcessMode}`

export const MUSIC_DETAIL_EDIT_ACTIONS: { mode: MusicEditMode; labelKey: string }[] = [
  { mode: 'extend', labelKey: 'music.actionExtend' },
  { mode: 'reference', labelKey: 'music.actionReference' },
  { mode: 'infill', labelKey: 'music.actionInfill' },
  { mode: 'rewrite', labelKey: 'music.actionRewrite' },
  { mode: 'overpainting', labelKey: 'music.actionOverpainting' },
  { mode: 'underpainting', labelKey: 'music.actionUnderpainting' },
  { mode: 'add_vocals', labelKey: 'music.actionAddVocals' },
  { mode: 'persona_sing', labelKey: 'music.actionPersonaSing' },
  { mode: 'cover', labelKey: 'music.actionCover' },
]

export const MUSIC_DETAIL_PROCESS_ACTIONS: { mode: MusicProcessMode; labelKey: string }[] = [
  { mode: 'vocal_stems', labelKey: 'music.actionVocalStems' },
  { mode: 'all_stems', labelKey: 'music.actionAllStems' },
]

export const MUSIC_EDIT_MODE_HINT_KEYS: Record<MusicEditMode, string> = {
  extend: 'music.actionHintExtend',
  reference: 'music.actionHintReference',
  infill: 'music.actionHintInfill',
  rewrite: 'music.actionHintRewrite',
  overpainting: 'music.actionHintOverpainting',
  underpainting: 'music.actionHintUnderpainting',
  add_vocals: 'music.actionHintAddVocals',
  persona_sing: 'music.actionHintPersonaSing',
  cover: 'music.actionHintCover',
}

export const MUSIC_PROCESS_MODE_HINT_KEYS: Record<MusicProcessMode, string> = {
  vocal_stems: 'music.actionHintVocalStems',
  all_stems: 'music.actionHintAllStems',
  midi: 'music.actionHintMidi',
}
