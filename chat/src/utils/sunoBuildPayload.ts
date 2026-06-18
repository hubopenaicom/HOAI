import type { MusicFormState } from '@/types/music'
import { SUNO_DEFAULT_MODEL_VERSION } from '@/types/music'
import { applyAdvancedParamsToPayload } from '@/utils/sunoAdvancedMetadata'
import type { SunoClipContext } from '@/utils/sunoClipContext'
import { adaptEditPayload, adaptStemPayload } from '@/utils/sunoPayloadAdapter'

function trim(s: string) {
  return (s || '').trim()
}

/** 从源曲直接发起分离（弹窗/卡片入口，不依赖侧栏 process 分区） */
export function buildStemSeparationPayload(
  continueClipId: string,
  mode: 'vocal_stems' | 'all_stems',
  mv: MusicFormState['mv'] = SUNO_DEFAULT_MODEL_VERSION,
  ctx?: SunoClipContext
): Record<string, unknown> {
  return adaptStemPayload(
    continueClipId,
    mode,
    { title: mode === 'all_stems' ? 'All stems' : 'Vocal stems', mv },
    ctx
  )
}

/** 根据侧栏表单组装 POST /suno/generate 请求体 */
export function buildSunoGeneratePayload(
  form: MusicFormState,
  ctx?: SunoClipContext
): Record<string, unknown> {
  const mv = form.mv
  const base: Record<string, unknown> = {}

  if (form.primaryTab === 'create') {
    if (form.createMode === 'inspire') {
      return {
        gpt_description_prompt: trim(form.gptDescriptionPrompt),
        mv,
        make_instrumental: false,
      }
    }
    if (form.createMode === 'instrumental_inspire') {
      return {
        gpt_description_prompt: trim(form.gptDescriptionPrompt),
        mv,
        prompt: '',
        make_instrumental: true,
      }
    }
    if (form.createMode === 'instrumental_custom') {
      return {
        prompt: '',
        tags: trim(form.tags),
        title: trim(form.title),
        mv,
        make_instrumental: true,
      }
    }
    return applyAdvancedParamsToPayload(
      {
        prompt: trim(form.prompt),
        tags: trim(form.tags),
        title: trim(form.title),
        mv,
        make_instrumental: false,
      },
      form
    )
  }

  if (form.primaryTab === 'edit') {
    const adapted = adaptEditPayload(form, ctx)
    if (adapted) return adapted
  }

  if (form.primaryTab === 'process') {
    const clip = trim(form.targetClipId)
    if (form.processMode === 'all_stems') {
      return adaptStemPayload(clip, 'all_stems', form, ctx)
    }
    if (form.processMode === 'vocal_stems') {
      return adaptStemPayload(clip, 'vocal_stems', form, ctx)
    }
    return base
  }

  return base
}

export function sunoChargeMultForForm(form: MusicFormState): number {
  if (form.primaryTab === 'process' && form.processMode === 'all_stems') return 5
  return 1
}

export function sunoSceneLabelForForm(form: MusicFormState): string {
  if (form.primaryTab === 'create') {
    if (form.useLyricsFirst && (form.createMode === 'inspire' || form.createMode === 'custom')) {
      return form.createMode === 'inspire' ? '先歌词·灵感→成曲' : '先歌词·自定义成曲'
    }
    const map: Record<string, string> = {
      inspire: '场景1·灵感',
      custom: '场景2·自定义',
      instrumental_custom: '场景3·纯音乐自定义',
      instrumental_inspire: '场景4·纯音乐灵感',
    }
    return map[form.createMode] || ''
  }
  if (form.primaryTab === 'edit') {
    const map: Record<string, string> = {
      extend: '场景5·续写',
      reference: '场景6·混音',
      infill: '场景7·替换',
      rewrite: '场景10·改写',
      overpainting: '场景11·重新填词',
      underpainting: 'Add Instrumental',
      add_vocals: 'Add Vocals',
      persona_sing: 'Persona 演唱',
      cover: 'Cover·翻版',
    }
    return map[form.editMode] || ''
  }
  if (form.primaryTab === 'process') {
    const map: Record<string, string> = {
      all_stems: '场景8·全轨分离',
      vocal_stems: '场景9·人声分离',
      midi: 'MIDI',
    }
    return map[form.processMode] || ''
  }
  return ''
}
