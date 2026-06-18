import type { MusicClipItem } from '@/types/music'
import { resolveDetailActionTooltipKey } from '@/utils/musicDetailActionTooltips'

describe('resolveDetailActionTooltipKey', () => {
  const clip = { midiState: 'complete' } as MusicClipItem

  it('returns midi view key when cached', () => {
    expect(resolveDetailActionTooltipKey('midi', clip)).toBe('music.actionTipMidiView')
  })

  it('returns stem view key when stems exist', () => {
    expect(resolveDetailActionTooltipKey('stem', clip, { stemCount: 3 })).toBe(
      'music.actionTipStemView'
    )
  })

  it('maps edit modes to modeHelp keys', () => {
    expect(resolveDetailActionTooltipKey('edit:extend', clip)).toBe('music.modeHelpExtend')
  })

  it('maps process modes to modeHelp keys', () => {
    expect(resolveDetailActionTooltipKey('process:all_stems', clip)).toBe('music.modeHelpAllStems')
  })
})
