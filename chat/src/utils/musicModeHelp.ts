import type {
  MusicCreateMode,
  MusicEditMode,
  MusicFormState,
  MusicPrimaryTab,
  MusicProcessMode,
  MusicToolsMode,
} from '@/types/music'
import { getSunoEditMvPolicy } from '@/utils/sunoEditMvPolicy'

export interface MusicModeHelpContext {
  /** 面板标题（复用侧栏模式按钮文案 key） */
  titleKey: string
  /** 主说明 */
  bodyKey: string
  /** 补充要点（步骤 / 注意） */
  tipKeys: string[]
  /** Suno 场景标签，如「场景 5」 */
  sceneKey?: string
  /** 编辑区 mv 策略说明（与下拉联动） */
  mvPolicyKey?: string
}

function createHelp(
  titleKey: string,
  bodyKey: string,
  tipKeys: string[] = [],
  sceneKey?: string
): MusicModeHelpContext {
  return { titleKey, bodyKey, tipKeys, sceneKey }
}

const CREATE_HELP: Record<MusicCreateMode, (form: MusicFormState) => MusicModeHelpContext> = {
  inspire: form =>
    createHelp(
      'music.createInspire',
      form.useLyricsFirst ? 'music.modeHelpInspire' : 'music.modeHelpInspireDirect',
      form.useLyricsFirst
        ? ['music.modeHelpInspireTipLyrics', 'music.modeHelpInspireTipTags']
        : ['music.modeHelpInspireTipOneShot'],
      'music.sceneLabel1'
    ),
  custom: form =>
    createHelp(
      'music.createCustom',
      'music.modeHelpCustom',
      form.useLyricsFirst
        ? ['music.modeHelpCustomTipLyrics', 'music.modeHelpCustomTipStructure']
        : ['music.modeHelpCustomTipStructure'],
      'music.sceneLabel2'
    ),
  instrumental_custom: () =>
    createHelp(
      'music.createInstrumentalCustom',
      'music.modeHelpInstrumentalCustom',
      ['music.modeHelpInstrumentalCustomTip'],
      'music.sceneLabel3'
    ),
  instrumental_inspire: () =>
    createHelp(
      'music.createInstrumentalInspire',
      'music.modeHelpInstrumentalInspire',
      ['music.modeHelpInstrumentalInspireTip'],
      'music.sceneLabel4'
    ),
}

const EDIT_HELP: Record<MusicEditMode, MusicModeHelpContext> = {
  extend: createHelp(
    'music.editExtend',
    'music.modeHelpExtend',
    ['music.modeHelpExtendTipClip', 'music.modeHelpExtendTipUpload'],
    'music.sceneLabel5'
  ),
  reference: createHelp(
    'music.editReference',
    'music.modeHelpReference',
    ['music.modeHelpReferenceTipClip', 'music.modeHelpReferenceTipUpload'],
    'music.sceneLabel6'
  ),
  infill: createHelp(
    'music.editInfill',
    'music.modeHelpInfill',
    ['music.modeHelpInfillTipRange', 'music.modeHelpInfillTipUpload'],
    'music.sceneLabel7'
  ),
  rewrite: createHelp(
    'music.editRewrite',
    'music.modeHelpRewrite',
    ['music.modeHelpRewriteTipNoMv'],
    'music.sceneLabel10'
  ),
  overpainting: createHelp(
    'music.editOverpainting',
    'music.modeHelpOverpainting',
    ['music.modeHelpOverpaintingTipRange', 'music.modeHelpBluejayRequired'],
    'music.sceneLabel11'
  ),
  underpainting: createHelp(
    'music.editUnderpainting',
    'music.modeHelpUnderpainting',
    ['music.modeHelpUnderpaintingTipUpload', 'music.modeHelpBluejayRequired'],
    'music.sceneLabel11b'
  ),
  add_vocals: createHelp(
    'music.editAddVocals',
    'music.modeHelpAddVocals',
    ['music.modeHelpAddVocalsTipUpload', 'music.modeHelpBluejayRequired'],
    'music.sceneLabel12'
  ),
  persona_sing: createHelp(
    'music.editPersonaSing',
    'music.modeHelpPersonaSing',
    ['music.modeHelpPersonaSingTipIds'],
    'music.sceneLabel9b'
  ),
  cover: createHelp(
    'music.editCover',
    'music.modeHelpCover',
    ['music.modeHelpCoverTipWeight'],
    'music.sceneLabel7b'
  ),
}

const PROCESS_HELP: Record<MusicProcessMode, MusicModeHelpContext> = {
  all_stems: createHelp(
    'music.processAllStems',
    'music.modeHelpAllStems',
    ['music.modeHelpAllStemsTipCharge', 'music.modeHelpAllStemsTipMidi'],
    'music.sceneLabel8'
  ),
  vocal_stems: createHelp(
    'music.processVocalStems',
    'music.modeHelpVocalStems',
    ['music.modeHelpVocalStemsTip'],
    'music.sceneLabel9'
  ),
  midi: createHelp(
    'music.processMidi',
    'music.modeHelpMidi',
    ['music.modeHelpMidiTipFlow'],
    'music.sceneLabelMidi'
  ),
}

const TOOLS_HELP: Record<MusicToolsMode, MusicModeHelpContext> = {
  upload: createHelp(
    'music.toolsUpload',
    'music.uploadHint',
    ['music.modeHelpUploadTipFormats', 'music.modeHelpUploadTipClip'],
    'music.sceneLabelUpload'
  ),
  tags: createHelp(
    'music.toolsTags',
    'music.toolsTagsHint',
    ['music.modeHelpTagsTipUsage'],
    'music.sceneLabelTags'
  ),
  concat: createHelp(
    'music.toolsConcat',
    'music.modeHelpConcat',
    ['music.concatNeedsExtendHint', 'music.modeHelpConcatTipInfill'],
    'music.sceneLabelConcat'
  ),
  persona: createHelp(
    'music.toolsPersona',
    'music.modeHelpPersona',
    ['music.modeHelpPersonaTipRoot', 'music.modeHelpPersonaTipReuse'],
    'music.sceneLabelPersona'
  ),
  extend_concat: createHelp(
    'music.toolsExtendConcat',
    'music.modeHelpExtendConcat',
    ['music.modeHelpExtendConcatTipSteps'],
    'music.sceneLabelExtendConcat'
  ),
}

const PRIMARY_TAB_HELP: Record<MusicPrimaryTab, MusicModeHelpContext> = {
  create: createHelp('music.primaryCreate', 'music.modeHelpPrimaryCreate', []),
  edit: createHelp('music.primaryEdit', 'music.modeHelpPrimaryEdit', [
    'music.modeHelpPrimaryEditTip',
  ]),
  process: createHelp('music.primaryProcess', 'music.modeHelpPrimaryProcess', [
    'music.modeHelpPrimaryProcessTip',
  ]),
  tools: createHelp('music.primaryTools', 'music.modeHelpPrimaryTools', [
    'music.modeHelpPrimaryToolsTip',
  ]),
}

export function resolveMusicModeHelp(form: MusicFormState): MusicModeHelpContext {
  let ctx: MusicModeHelpContext
  if (form.primaryTab === 'create') {
    ctx = CREATE_HELP[form.createMode](form)
  } else if (form.primaryTab === 'edit') {
    ctx = { ...EDIT_HELP[form.editMode] }
    const policy = getSunoEditMvPolicy(form.editMode)
    if (policy.hintKey) ctx.mvPolicyKey = policy.hintKey
  } else if (form.primaryTab === 'process') {
    ctx = PROCESS_HELP[form.processMode]
  } else {
    ctx = TOOLS_HELP[form.toolsMode]
  }
  return ctx
}

/** 主分区切换时附加顶层说明（与子模式说明合并展示） */
export function resolveMusicPrimaryTabHelp(tab: MusicPrimaryTab): MusicModeHelpContext {
  return PRIMARY_TAB_HELP[tab]
}

export function musicModeHelpContextKey(form: MusicFormState): string {
  const base = `${form.primaryTab}:${form.createMode}:${form.editMode}:${form.processMode}:${form.toolsMode}`
  if (form.primaryTab === 'create') {
    return `${base}:lf${form.useLyricsFirst ? 1 : 0}`
  }
  return base
}
