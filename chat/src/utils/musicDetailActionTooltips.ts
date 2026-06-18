import type { MusicClipItem, MusicEditMode, MusicProcessMode } from '@/types/music'
import type { MusicDetailActionKind } from '@/utils/musicDetailActions'

const PRIMARY_TOOLTIP_KEYS: Partial<Record<MusicDetailActionKind, string>> = {
  stem: 'music.actionTipStem',
  lyrics: 'music.actionTipLyrics',
  wav: 'music.actionTipWav',
  mp4: 'music.actionTipMp4',
  timing: 'music.actionTipTiming',
  midi: 'music.actionTipMidi',
  vox: 'music.actionTipVox',
  concat: 'music.actionTipConcat',
  wizard: 'music.actionTipWizard',
}

const EDIT_TOOLTIP_KEYS: Record<MusicEditMode, string> = {
  extend: 'music.modeHelpExtend',
  reference: 'music.modeHelpReference',
  infill: 'music.modeHelpInfill',
  rewrite: 'music.modeHelpRewrite',
  overpainting: 'music.modeHelpOverpainting',
  underpainting: 'music.modeHelpUnderpainting',
  add_vocals: 'music.modeHelpAddVocals',
  persona_sing: 'music.modeHelpPersonaSing',
  cover: 'music.modeHelpCover',
}

const PROCESS_TOOLTIP_KEYS: Record<MusicProcessMode, string> = {
  vocal_stems: 'music.modeHelpVocalStems',
  all_stems: 'music.modeHelpAllStems',
  midi: 'music.modeHelpMidi',
}

/** 后续操作区按钮悬停说明的 i18n key */
export function resolveDetailActionTooltipKey(
  kind: MusicDetailActionKind,
  clip?: MusicClipItem | null,
  options?: { stemCount?: number }
): string | undefined {
  if (kind === 'stem' && (options?.stemCount ?? 0) > 0) {
    return 'music.actionTipStemView'
  }
  if (kind === 'midi' && clip?.midiState === 'complete') {
    return 'music.actionTipMidiView'
  }
  if (kind.startsWith('edit:')) {
    return EDIT_TOOLTIP_KEYS[kind.slice(5) as MusicEditMode]
  }
  if (kind.startsWith('process:')) {
    return PROCESS_TOOLTIP_KEYS[kind.slice(8) as MusicProcessMode]
  }
  return PRIMARY_TOOLTIP_KEYS[kind]
}
