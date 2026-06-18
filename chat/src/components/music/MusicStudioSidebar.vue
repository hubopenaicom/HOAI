<script setup lang="ts">
import { t } from '@/locales'
import type {
  MusicCreateMode,
  MusicEditMode,
  MusicFormState,
  MusicPrimaryTab,
  MusicProcessMode,
  MusicToolsMode,
  SunoModelVersion,
} from '@/types/music'
import { SUNO_MV_SELECT_OPTIONS } from '@/types/music'
import {
  filterMvOptionsForEditMode,
  getSunoEditMvPolicy,
  resolveSunoMvForEditMode,
} from '@/utils/sunoEditMvPolicy'
import MusicActionTooltipWrap from '@/components/music/MusicActionTooltipWrap.vue'
import MusicAdvancedParams from '@/components/music/MusicAdvancedParams.vue'
import MusicIcon from '@/components/music/MusicIcon.vue'
import MusicModeHelpPanel from '@/components/music/MusicModeHelpPanel.vue'
import MusicTagsExpandField from '@/components/music/MusicTagsExpandField.vue'
import { formatUploadDurationLimitSec, SUNO_UPLOAD_HARD_MAX_SEC } from '@/utils/sunoMvLimits'
import { formatUploadMaxFileMb } from '@/utils/sunoCapabilityGuards'
import { musicModeHelpContextKey, resolveMusicModeHelp } from '@/utils/musicModeHelp'
import type { MusicUploadProgressState } from '@/utils/musicUploadProgress'
import {
  estimateUploadEtaSec,
  formatUploadBytes,
  formatUploadSpeed,
} from '@/utils/musicUploadSpeed'
import { computed, ref, watch } from 'vue'

export interface MusicModelOption {
  model: string
  modelName: string
}

const props = defineProps<{
  form: MusicFormState
  musicModels?: MusicModelOption[]
  selectedModelKey?: string
  modelsLoading?: boolean
  submitting?: boolean
  lyricsGenerating?: boolean
  tagsExpanding?: boolean
  expandedTags?: string
  uploadFileName?: string
  uploading?: boolean
  uploadProgress?: MusicUploadProgressState | null
  uploadMode?: 'file' | 'url' | null
  uploadError?: string
  uploadErrorKind?: string
  lastUploadClipId?: string
  personaRootBlocked?: boolean
  sidebarFocusToken?: number
}>()

const emit = defineEmits<{
  'update:form': [MusicFormState]
  'update:selectedModelKey': [string]
  submit: []
  generateLyrics: []
  expandTags: []
  uploadFile: [File]
  uploadUrl: [string]
  uploadGoEdit: [MusicEditMode?]
  openWizard: []
}>()

function patch(partial: Partial<MusicFormState>) {
  emit('update:form', { ...props.form, ...partial })
}

const sidebarRoot = ref<HTMLElement | null>(null)
const sidebarPulsing = ref(false)
let sidebarPulseTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.sidebarFocusToken,
  token => {
    if (token == null || token <= 0) return
    sidebarPulsing.value = true
    clearTimeout(sidebarPulseTimer)
    sidebarPulseTimer = setTimeout(() => {
      sidebarPulsing.value = false
    }, 2200)
  }
)

function scrollIntoView() {
  sidebarRoot.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

defineExpose({ scrollIntoView })

const primaryTabs: { id: MusicPrimaryTab; labelKey: string }[] = [
  { id: 'create', labelKey: 'music.primaryCreate' },
  { id: 'edit', labelKey: 'music.primaryEdit' },
  { id: 'process', labelKey: 'music.primaryProcess' },
  { id: 'tools', labelKey: 'music.primaryTools' },
]

const createModes: { id: MusicCreateMode; labelKey: string }[] = [
  { id: 'inspire', labelKey: 'music.createInspire' },
  { id: 'custom', labelKey: 'music.createCustom' },
  { id: 'instrumental_custom', labelKey: 'music.createInstrumentalCustom' },
  { id: 'instrumental_inspire', labelKey: 'music.createInstrumentalInspire' },
]

const editModes: { id: MusicEditMode; labelKey: string }[] = [
  { id: 'extend', labelKey: 'music.editExtend' },
  { id: 'reference', labelKey: 'music.editReference' },
  { id: 'infill', labelKey: 'music.editInfill' },
  { id: 'rewrite', labelKey: 'music.editRewrite' },
  { id: 'overpainting', labelKey: 'music.editOverpainting' },
  { id: 'underpainting', labelKey: 'music.editUnderpainting' },
  { id: 'add_vocals', labelKey: 'music.editAddVocals' },
  { id: 'persona_sing', labelKey: 'music.editPersonaSing' },
  { id: 'cover', labelKey: 'music.editCover' },
]

const processModes: { id: MusicProcessMode; labelKey: string }[] = [
  { id: 'all_stems', labelKey: 'music.processAllStems' },
  { id: 'vocal_stems', labelKey: 'music.processVocalStems' },
  { id: 'midi', labelKey: 'music.processMidi' },
]

const toolsModes: { id: MusicToolsMode; labelKey: string }[] = [
  { id: 'upload', labelKey: 'music.toolsUpload' },
  { id: 'tags', labelKey: 'music.toolsTags' },
  { id: 'concat', labelKey: 'music.toolsConcat' },
  { id: 'persona', labelKey: 'music.toolsPersona' },
  { id: 'extend_concat', labelKey: 'music.toolsExtendConcat' },
]

const modeHelpContext = computed(() => resolveMusicModeHelp(props.form))
const modeHelpContextKey = computed(() => musicModeHelpContextKey(props.form))

const modeHelpExtraLines = computed(() => {
  const f = props.form
  if (f.primaryTab !== 'tools' || f.toolsMode !== 'upload') return []
  return [
    t('music.uploadMaxSizeHint', { mb: formatUploadMaxFileMb() }),
    t('music.uploadHintMvLimit', {
      mv: f.mv,
      limit: formatUploadDurationLimitSec(f.mv),
      hard: SUNO_UPLOAD_HARD_MAX_SEC,
    }),
  ]
})

const isUploadCatalogError = computed(() => props.uploadErrorKind === 'catalog')

const uploadProgressPercent = computed(() => {
  if (!props.uploading) return 0
  return Math.min(100, Math.max(0, props.uploadProgress?.percent ?? 3))
})

const uploadProgressLabel = computed(() => {
  if (!props.uploading) return ''
  const pct = uploadProgressPercent.value
  const phase = props.uploadProgress?.phase ?? 'preparing'
  if (phase === 'preparing') return t('music.uploadProgressPreparing', { pct })
  if (phase === 'analyzing') return t('music.uploadProgressAnalyzing', { pct })
  if (phase === 'transfer') return t('music.uploadProgressTransfer', { pct })
  if (phase === 'processing') return t('music.uploadProgressProcessing', { pct })
  return t('music.uploadProgressPolling', { pct })
})

const uploadProgressDetail = computed(() => {
  const p = props.uploadProgress
  if (!props.uploading || !p) return ''
  if (p.phase === 'transfer' && p.totalBytes != null && p.totalBytes > 0) {
    const loaded = formatUploadBytes(p.loadedBytes ?? 0)
    const total = formatUploadBytes(p.totalBytes)
    const speed =
      p.bytesPerSecond && p.bytesPerSecond > 0
        ? formatUploadSpeed(p.bytesPerSecond)
        : t('music.uploadSpeedCalculating')
    const eta = estimateUploadEtaSec(p.loadedBytes ?? 0, p.totalBytes, p.bytesPerSecond ?? 0)
    if (eta != null && eta > 0) {
      return t('music.uploadProgressBytesEta', { loaded, total, speed, sec: eta })
    }
    return t('music.uploadProgressBytes', { loaded, total, speed })
  }
  if (p.phase === 'preparing') return t('music.uploadProgressPreparingDetail')
  if (p.phase === 'analyzing' && p.totalBytes) {
    return t('music.uploadProgressAnalyzingDetail', { size: formatUploadBytes(p.totalBytes) })
  }
  if (p.phase === 'processing') return t('music.uploadProgressProcessingHint')
  if (p.phase === 'polling') return t('music.uploadProgressPollingHint')
  return ''
})

const showFileUploadProgress = computed(() => props.uploading && props.uploadMode === 'file')
const showUrlUploadProgress = computed(() => props.uploading && props.uploadMode === 'url')

const showMv = computed(() => {
  if (props.form.primaryTab === 'tools') return props.form.toolsMode === 'upload'
  if (props.form.primaryTab === 'process' && props.form.processMode === 'midi') return false
  if (props.form.primaryTab === 'process') return false
  if (props.form.primaryTab === 'edit') {
    return getSunoEditMvPolicy(props.form.editMode).uiMode !== 'hidden'
  }
  return true
})

const editMvPolicy = computed(() =>
  props.form.primaryTab === 'edit' ? getSunoEditMvPolicy(props.form.editMode) : null
)

const mvOptions = computed(() => {
  if (props.form.primaryTab === 'edit') {
    return filterMvOptionsForEditMode(props.form.editMode)
  }
  return SUNO_MV_SELECT_OPTIONS
})

const mvSelectDisabled = computed(() => editMvPolicy.value?.uiMode === 'locked')

const showAdvancedParams = computed(() => {
  const f = props.form
  if (f.primaryTab === 'create' && f.createMode === 'custom') return true
  if (f.primaryTab === 'edit' && f.editMode === 'cover') return true
  return false
})

const showCoverOnlyAudioWeight = computed(
  () =>
    props.form.primaryTab === 'edit' && props.form.editMode === 'cover' && !showAdvancedParams.value
)

const showExtendConcatPanel = computed(
  () => props.form.primaryTab === 'tools' && props.form.toolsMode === 'extend_concat'
)

const showLyricsWorkflow = computed(() => {
  const f = props.form
  return f.primaryTab === 'create' && (f.createMode === 'inspire' || f.createMode === 'custom')
})

const hasLyricsDraft = computed(() => Boolean(props.form.prompt?.trim()))

const generateLyricsTip = computed(() => {
  if (!showLyricsWorkflow.value || !props.form.useLyricsFirst) return ''
  return t('music.generateLyricsTip')
})

const generateMusicTip = computed(() => {
  if (!showLyricsWorkflow.value || !props.form.useLyricsFirst) return ''
  return hasLyricsDraft.value
    ? t('music.generateMusicTipWithLyrics')
    : t('music.generateMusicTipAuto')
})

const showTitle = computed(() => {
  const f = props.form
  if (f.primaryTab === 'tools') return false
  if (f.primaryTab === 'process' && f.processMode !== 'midi') return false
  if (f.primaryTab === 'edit' && f.editMode === 'rewrite') return false
  if (f.primaryTab === 'create' && f.createMode === 'inspire' && !f.useLyricsFirst) return false
  if (f.primaryTab === 'create' && f.createMode === 'instrumental_inspire') return false
  return true
})

const showTags = computed(() => {
  const f = props.form
  if (f.primaryTab === 'tools' || f.primaryTab === 'process') return false
  if (f.primaryTab === 'edit' && f.editMode === 'rewrite') return false
  if (f.primaryTab === 'create' && f.createMode === 'inspire' && !f.useLyricsFirst) return false
  if (f.primaryTab === 'create' && f.createMode === 'instrumental_inspire') return false
  return true
})

const showPrompt = computed(() => {
  const f = props.form
  if (f.primaryTab === 'tools' || f.primaryTab === 'process') return false
  if (f.primaryTab === 'create' && f.createMode === 'inspire' && !f.useLyricsFirst) return false
  if (f.primaryTab === 'create' && f.createMode === 'instrumental_inspire') return false
  if (f.primaryTab === 'edit' && f.editMode === 'rewrite') return false
  if (f.primaryTab === 'create' && f.createMode === 'instrumental_custom') return false
  if (f.primaryTab === 'edit' && f.editMode === 'underpainting') return false
  if (f.primaryTab === 'edit' && f.editMode === 'persona_sing') return true
  return true
})

const showPersonaSingFields = computed(
  () => props.form.primaryTab === 'edit' && props.form.editMode === 'persona_sing'
)

const showPersonaCreateFields = computed(
  () => props.form.primaryTab === 'tools' && props.form.toolsMode === 'persona'
)

const showConcatFields = computed(
  () => props.form.primaryTab === 'tools' && props.form.toolsMode === 'concat'
)

const showInspire = computed(() => {
  const f = props.form
  return (
    f.primaryTab === 'create' &&
    (f.createMode === 'inspire' || f.createMode === 'instrumental_inspire')
  )
})

const showTargetClip = computed(() => {
  const f = props.form
  if (f.primaryTab === 'edit') return true
  if (f.primaryTab === 'process' && f.processMode !== 'midi') return true
  if (f.primaryTab === 'process' && f.processMode === 'midi') return true
  return false
})

const showContinueAt = computed(
  () => props.form.primaryTab === 'edit' && props.form.editMode === 'extend'
)

const showTimeRange = computed(() => {
  const f = props.form
  return (
    (f.primaryTab === 'edit' && f.editMode === 'infill') ||
    (f.primaryTab === 'edit' && f.editMode === 'overpainting') ||
    (f.primaryTab === 'edit' && f.editMode === 'add_vocals') ||
    (f.primaryTab === 'edit' && f.editMode === 'underpainting')
  )
})

const timeRangeStart = computed(() => {
  const f = props.form
  if (f.editMode === 'underpainting') return f.underpaintingStartS
  if (f.editMode === 'overpainting' || f.editMode === 'add_vocals') return f.overpaintingStartS
  return f.infillStartS
})

const timeRangeEnd = computed(() => {
  const f = props.form
  if (f.editMode === 'underpainting') return f.underpaintingEndS
  if (f.editMode === 'overpainting' || f.editMode === 'add_vocals') return f.overpaintingEndS
  return f.infillEndS
})

function onTimeRangeStart(e: Event) {
  const v = Number((e.target as HTMLInputElement).value) || 0
  const mode = props.form.editMode
  if (mode === 'underpainting') patch({ underpaintingStartS: v })
  else if (mode === 'overpainting' || mode === 'add_vocals') patch({ overpaintingStartS: v })
  else patch({ infillStartS: v })
}

function onTimeRangeEnd(e: Event) {
  const v = Number((e.target as HTMLInputElement).value) || 0
  const mode = props.form.editMode
  if (mode === 'underpainting') patch({ underpaintingEndS: v })
  else if (mode === 'overpainting' || mode === 'add_vocals') patch({ overpaintingEndS: v })
  else patch({ infillEndS: v })
}

const showSourceUpload = computed(
  () => props.form.primaryTab === 'edit' && props.form.editMode !== 'rewrite'
)

function onPrimaryTabChange(id: MusicPrimaryTab) {
  const partial: Partial<MusicFormState> = { primaryTab: id }
  if (id === 'edit') {
    partial.mv = resolveSunoMvForEditMode(props.form.editMode, props.form.mv)
  }
  patch(partial)
}

function onEditModeChange(id: MusicEditMode) {
  const partial: Partial<MusicFormState> = {
    editMode: id,
    mv: resolveSunoMvForEditMode(id, props.form.mv, props.form.editMode),
  }
  if (id === 'cover') {
    partial.audioWeight = props.form.audioWeight ?? 0.5
  }
  patch(partial)
}

async function onFileChange(e: Event) {
  const inp = e.target as HTMLInputElement
  const raw = inp.files?.[0]
  if (!raw) return
  let file: File
  try {
    const buf = await raw.arrayBuffer()
    file = new File([buf], raw.name, {
      type: raw.type || 'audio/mpeg',
      lastModified: raw.lastModified,
    })
  } catch {
    file = new File([raw.slice()], raw.name, {
      type: raw.type || 'audio/mpeg',
      lastModified: raw.lastModified,
    })
  }
  inp.value = ''
  emit('uploadFile', file)
}
</script>

<template>
  <aside
    ref="sidebarRoot"
    class="music-sidebar flex h-full min-h-0 w-full flex-col border-[var(--music-border-subtle)] bg-gradient-to-b from-[var(--music-surface-sidebar-grad-from)] via-[var(--music-surface-sidebar-grad-via)] to-[var(--music-surface-sidebar-grad-to)] lg:max-w-[min(100%,420px)] lg:w-[min(100%,420px)] lg:border-r"
    :class="{ 'music-sidebar-pulse': sidebarPulsing }"
  >
    <div class="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-4">
      <div class="flex items-start gap-3">
        <div class="music-brand-icon" aria-hidden="true">
          <MusicIcon name="waveform" :size="22" :stroke-width="2" />
        </div>
        <div class="min-w-0">
          <h1 class="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {{ t('music.title') }}
          </h1>
          <p class="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
            {{ t('music.subtitle') }}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label class="music-form-label music-form-label--caps">{{
          t('music.selectApiModel')
        }}</label>
        <select
          :value="selectedModelKey"
          class="music-select w-full text-sm"
          :disabled="modelsLoading || !musicModels?.length"
          @change="emit('update:selectedModelKey', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">
            {{ modelsLoading ? '…' : musicModels?.length ? '—' : t('music.noModels') }}
          </option>
          <option v-for="m in musicModels" :key="m.model" :value="m.model">
            {{ m.modelName }}
          </option>
        </select>
      </div>

      <!-- 主分区 -->
      <div
        class="flex flex-wrap gap-1 rounded-xl border border-[var(--music-border-subtle)] bg-[var(--music-surface-field)] p-1"
        role="tablist"
      >
        <button
          v-for="tab in primaryTabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="music-primary-tab flex-1 min-w-[4.5rem] rounded-lg px-2 py-2 text-xs font-medium transition-all"
          :class="form.primaryTab === tab.id ? 'music-tab-active' : ''"
          :aria-selected="form.primaryTab === tab.id"
          @click="onPrimaryTabChange(tab.id)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>

      <!-- 子场景 -->
      <div
        v-if="form.primaryTab === 'create'"
        class="grid grid-cols-2 gap-2"
        role="tablist"
        aria-label="create modes"
      >
        <button
          v-for="m in createModes"
          :key="m.id"
          type="button"
          class="music-mode-btn music-mode-btn--grid rounded-xl border px-3 py-2.5 text-left text-xs font-medium leading-snug"
          :class="form.createMode === m.id ? 'is-active' : ''"
          @click="patch({ createMode: m.id })"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>

      <div v-else-if="form.primaryTab === 'edit'" class="flex flex-col gap-1">
        <button
          v-for="m in editModes"
          :key="m.id"
          type="button"
          class="music-mode-btn rounded-lg px-3 py-2 text-left text-sm"
          :class="form.editMode === m.id ? 'is-active' : ''"
          @click="onEditModeChange(m.id)"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>

      <div v-else-if="form.primaryTab === 'process'" class="flex flex-col gap-1">
        <button
          v-for="m in processModes"
          :key="m.id"
          type="button"
          class="music-mode-btn rounded-lg px-3 py-2 text-left text-sm"
          :class="form.processMode === m.id ? 'is-active' : ''"
          @click="patch({ processMode: m.id })"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>

      <div v-else class="flex flex-col gap-1">
        <button
          v-for="m in toolsModes"
          :key="m.id"
          type="button"
          class="music-mode-btn rounded-lg px-3 py-2 text-left text-sm"
          :class="form.toolsMode === m.id ? 'is-active' : ''"
          @click="patch({ toolsMode: m.id })"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>

      <!-- 模式说明（常驻可见，随切换刷新） -->
      <MusicModeHelpPanel
        :context="modeHelpContext"
        :context-key="modeHelpContextKey"
        :extra-lines="modeHelpExtraLines"
      />

      <!-- 工具：上传 -->
      <div
        v-if="form.primaryTab === 'tools' && form.toolsMode === 'upload'"
        class="music-form-panel"
      >
        <label
          class="music-upload-zone"
          :class="{
            'music-upload-zone--loading': showFileUploadProgress,
            'music-upload-zone--active': showFileUploadProgress,
            'pointer-events-none': uploading,
          }"
        >
          <template v-if="showFileUploadProgress">
            <div
              class="music-upload-progress music-upload-progress--inline"
              role="progressbar"
              :aria-valuenow="uploadProgressPercent"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="uploadProgressLabel"
            >
              <p class="music-upload-progress__title">{{ uploadProgressLabel }}</p>
              <p v-if="uploadProgressDetail" class="music-upload-progress__detail">
                {{ uploadProgressDetail }}
              </p>
              <div class="music-upload-progress__track music-upload-progress__track--lg">
                <div
                  class="music-upload-progress__bar"
                  :style="{ width: `${Math.max(uploadProgressPercent, 4)}%` }"
                />
              </div>
              <p class="music-upload-progress__pct-lg">{{ uploadProgressPercent }}%</p>
            </div>
          </template>
          <template v-else>
            <span>{{ t('music.uploadAudio') }}</span>
          </template>
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.flac"
            class="hidden"
            :disabled="uploading"
            @change="onFileChange"
          />
        </label>
        <p v-if="uploadFileName && showFileUploadProgress" class="text-xs music-text-accent">
          {{ t('music.uploadSelected') }}: {{ uploadFileName }}
        </p>
        <p
          v-if="uploadError"
          class="music-upload-error"
          :class="{ 'music-upload-error--catalog': isUploadCatalogError }"
          role="alert"
        >
          {{ uploadError }}
        </p>
        <p v-if="isUploadCatalogError" class="music-upload-error-tips" role="note">
          {{ t('music.uploadCatalogTips') }}
        </p>
        <div v-if="lastUploadClipId && !uploading" class="music-upload-success" role="status">
          <p class="music-upload-success__title">{{ t('music.uploadOkList') }}</p>
          <p class="music-upload-success__id">
            clip_id: <code>{{ lastUploadClipId }}</code>
          </p>
          <p class="text-xs text-[var(--text-muted)]">{{ t('music.uploadDoneHint') }}</p>
          <div class="music-upload-success__actions">
            <button
              type="button"
              class="music-btn-secondary music-btn-sm"
              @click="emit('uploadGoEdit', 'extend')"
            >
              {{ t('music.uploadGoExtend') }}
            </button>
            <button
              type="button"
              class="music-btn-secondary music-btn-sm"
              @click="emit('uploadGoEdit', 'cover')"
            >
              {{ t('music.uploadGoCover') }}
            </button>
          </div>
        </div>
        <div class="mt-3 border-t border-[var(--music-border-subtle)] pt-3">
          <label class="music-form-label">{{ t('music.uploadUrlLabel') }}</label>
          <input
            :value="form.uploadAudioUrl"
            type="url"
            class="music-input mt-1 text-sm"
            :placeholder="t('music.uploadUrlPlaceholder')"
            :disabled="uploading"
            @input="patch({ uploadAudioUrl: ($event.target as HTMLInputElement).value })"
          />
          <button
            type="button"
            class="music-btn-secondary music-btn-sm mt-2 w-full"
            :disabled="!form.uploadAudioUrl.trim() || uploading"
            @click="emit('uploadUrl', form.uploadAudioUrl.trim())"
          >
            {{
              showUrlUploadProgress
                ? uploadProgressLabel || t('music.uploading')
                : t('music.uploadUrlSubmit')
            }}
          </button>
          <div
            v-if="showUrlUploadProgress"
            class="music-upload-progress mt-2"
            role="progressbar"
            :aria-valuenow="uploadProgressPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <p v-if="uploadProgressDetail" class="music-upload-progress__detail mb-1">
              {{ uploadProgressDetail }}
            </p>
            <div class="music-upload-progress__track">
              <div
                class="music-upload-progress__bar"
                :style="{ width: `${Math.max(uploadProgressPercent, 4)}%` }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 工具：歌曲拼接 -->
      <div v-else-if="showConcatFields" class="music-form-panel">
        <label class="music-form-label">{{ t('music.concatClipLabel') }}</label>
        <input
          :value="form.concatClipId"
          type="text"
          class="music-input music-input--mono"
          :placeholder="t('music.targetClipPlaceholder')"
          @input="patch({ concatClipId: ($event.target as HTMLInputElement).value })"
        />
        <label class="music-check-row">
          <input
            type="checkbox"
            class="music-checkbox"
            :checked="form.concatIsInfill"
            @change="patch({ concatIsInfill: ($event.target as HTMLInputElement).checked })"
          />
          {{ t('music.concatIsInfill') }}
        </label>
      </div>

      <!-- 工具：Persona 创建 -->
      <div v-else-if="showPersonaCreateFields" class="music-form-panel">
        <p v-if="personaRootBlocked" class="music-upload-error-tips" role="note">
          {{ t('music.limitPersonaUploadClip') }}
        </p>
        <input
          :value="form.personaRootClipId"
          type="text"
          class="music-input music-input--mono"
          :placeholder="t('music.personaRootClip')"
          @input="patch({ personaRootClipId: ($event.target as HTMLInputElement).value })"
        />
        <input
          :value="form.personaName"
          type="text"
          class="music-input"
          :placeholder="t('music.personaName')"
          @input="patch({ personaName: ($event.target as HTMLInputElement).value })"
        />
        <textarea
          :value="form.personaDescription"
          class="music-textarea min-h-[72px] text-sm"
          :placeholder="t('music.personaDescription')"
          @input="patch({ personaDescription: ($event.target as HTMLTextAreaElement).value })"
        />
        <label class="music-check-row">
          <input
            type="checkbox"
            class="music-checkbox"
            :checked="form.personaIsPublic"
            @change="patch({ personaIsPublic: ($event.target as HTMLInputElement).checked })"
          />
          {{ t('music.personaPublic') }}
        </label>
      </div>

      <!-- 工具：续写并拼接向导 -->
      <div
        v-else-if="showExtendConcatPanel"
        class="music-form-panel border-[var(--music-accent)]/30"
      >
        <p class="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
          {{ t('music.modeHelpExtendConcatTipSteps') }}
        </p>
        <button
          type="button"
          class="music-btn-primary music-btn-sm music-action-btn--with-icon w-full !w-full"
          @click="emit('openWizard')"
        >
          <MusicIcon name="wand" :size="16" class="music-action-btn__icon" />
          {{ t('music.wizardOpen') }}
        </button>
      </div>

      <!-- 工具：Tags 扩展 -->
      <div
        v-else-if="form.primaryTab === 'tools' && form.toolsMode === 'tags'"
        class="music-form-panel"
      >
        <p class="mb-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
          {{ t('music.toolsTagsHint') }}
        </p>
        <MusicTagsExpandField
          layout="stack"
          :tags="form.tags"
          :expanding="tagsExpanding"
          :result="expandedTags"
          :label="t('music.toolsTagsInput')"
          placeholder="student, happy, rock"
          @update:tags="patch({ tags: $event })"
          @expand="emit('expandTags')"
        />
      </div>

      <!-- 通用表单 -->
      <div v-else class="music-form-panel shadow-sm">
        <div
          v-if="showLyricsWorkflow"
          class="rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2.5"
        >
          <div class="flex items-start gap-2">
            <input
              id="music-lyrics-first"
              type="checkbox"
              class="music-checkbox music-checkbox--accent mt-0.5"
              :checked="form.useLyricsFirst"
              @change="patch({ useLyricsFirst: ($event.target as HTMLInputElement).checked })"
            />
            <div class="min-w-0 flex-1">
              <label
                for="music-lyrics-first"
                class="text-sm font-medium text-[var(--text-secondary)]"
              >
                {{ t('music.lyricsFirstLabel') }}
              </label>
              <p class="mt-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
                {{ t('music.lyricsWorkflowHint') }}
              </p>
              <p
                v-if="!hasLyricsDraft"
                class="mt-1 text-[10px] leading-relaxed text-amber-600/90 dark:text-amber-400/90"
              >
                {{ t('music.lyricsWorkflowAutoNote') }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="showCoverOnlyAudioWeight">
          <label class="music-form-label">{{ t('music.audioWeightLabel') }}</label>
          <input
            :value="form.audioWeight ?? 0.5"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="music-range mt-2"
            @input="
              patch({
                audioWeight: Number(($event.target as HTMLInputElement).value),
              })
            "
          />
          <p class="text-center text-xs text-[var(--text-muted)]">
            {{ (form.audioWeight ?? 0.5).toFixed(2) }}
          </p>
        </div>

        <div v-if="showMv">
          <label class="music-form-label">{{ t('music.selectVersion') }}</label>
          <select
            :value="form.mv"
            class="music-select mt-1 w-full"
            :disabled="mvSelectDisabled"
            @change="patch({ mv: ($event.target as HTMLSelectElement).value as SunoModelVersion })"
          >
            <option v-for="opt in mvOptions" :key="opt.value" :value="opt.value">
              {{ t(opt.labelKey) }}
            </option>
          </select>
        </div>

        <div v-if="showInspire">
          <label class="music-form-label">{{ t('music.inspireLabel') }}</label>
          <textarea
            :value="form.gptDescriptionPrompt"
            class="music-textarea mt-1 min-h-[88px] text-sm"
            :placeholder="t('music.inspirePlaceholder')"
            rows="3"
            @input="patch({ gptDescriptionPrompt: ($event.target as HTMLTextAreaElement).value })"
          />
        </div>

        <div v-if="showPrompt">
          <label class="music-form-label">{{ t('music.promptLabel') }}</label>
          <p class="mt-0.5 text-[10px] text-[var(--text-muted)]">{{ t('music.lyricTagsHint') }}</p>
          <textarea
            :value="form.prompt"
            class="music-textarea mt-1 min-h-[140px] font-mono text-sm"
            :placeholder="t('music.promptPlaceholder')"
            rows="6"
            @input="patch({ prompt: ($event.target as HTMLTextAreaElement).value })"
          />
        </div>

        <div v-if="showTags">
          <MusicTagsExpandField
            layout="inline"
            :tags="form.tags"
            :expanding="tagsExpanding"
            :result="expandedTags"
            :label="t('music.tagsLabel')"
            :placeholder="t('music.tagsPlaceholder')"
            :show-result="Boolean(expandedTags)"
            @update:tags="patch({ tags: $event })"
            @expand="emit('expandTags')"
          />
        </div>

        <div v-if="showTitle">
          <label class="music-form-label">{{ t('music.titleLabel') }}</label>
          <input
            :value="form.title"
            type="text"
            class="music-input mt-1"
            :placeholder="t('music.titlePlaceholder')"
            @input="patch({ title: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <label
          v-if="
            form.primaryTab === 'create' &&
            (form.createMode === 'instrumental_inspire' ||
              form.createMode === 'instrumental_custom')
          "
          for="music-instrumental"
          class="music-check-row"
        >
          <input
            :id="'music-instrumental'"
            type="checkbox"
            class="music-checkbox music-checkbox--accent"
            :checked="form.makeInstrumental || form.createMode.startsWith('instrumental')"
            @change="patch({ makeInstrumental: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('music.makeInstrumental') }}</span>
        </label>

        <div v-if="showPersonaSingFields" class="grid gap-2">
          <input
            :value="form.personaId"
            type="text"
            class="music-input music-input--mono"
            :placeholder="t('music.personaId')"
            @input="patch({ personaId: ($event.target as HTMLInputElement).value })"
          />
          <input
            :value="form.artistClipId"
            type="text"
            class="music-input music-input--mono"
            :placeholder="t('music.artistClipId')"
            @input="patch({ artistClipId: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <div v-if="showTargetClip">
          <label class="music-form-label">{{ t('music.targetClipLabel') }}</label>
          <input
            :value="form.targetClipId"
            type="text"
            class="music-input mt-1 music-input--mono"
            :placeholder="t('music.targetClipPlaceholder')"
            @input="patch({ targetClipId: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <div v-if="showContinueAt" class="grid grid-cols-2 gap-2">
          <div>
            <label class="music-form-label">{{ t('music.continueAtLabel') }}</label>
            <input
              :value="form.continueAt ?? ''"
              type="number"
              min="0"
              step="0.1"
              class="music-input mt-1"
              @input="
                patch({
                  continueAt: ($event.target as HTMLInputElement).value
                    ? Number(($event.target as HTMLInputElement).value)
                    : null,
                })
              "
            />
          </div>
        </div>

        <div v-if="showTimeRange" class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-[var(--text-muted)]">{{ t('music.timeStart') }}</label>
            <input
              :value="timeRangeStart ?? ''"
              type="number"
              min="0"
              step="0.1"
              class="music-input mt-1"
              @input="onTimeRangeStart"
            />
          </div>
          <div>
            <label class="text-xs text-[var(--text-muted)]">{{ t('music.timeEnd') }}</label>
            <input
              :value="timeRangeEnd ?? ''"
              type="number"
              min="0"
              step="0.1"
              class="music-input mt-1"
              @input="onTimeRangeEnd"
            />
          </div>
        </div>

        <MusicAdvancedParams
          v-if="showAdvancedParams"
          :form="form"
          :show-cover-sliders="form.primaryTab === 'edit' && form.editMode === 'cover'"
          @update:form="emit('update:form', $event)"
        />

        <label v-if="showSourceUpload" for="music-source-upload" class="music-check-row text-xs">
          <input
            id="music-source-upload"
            type="checkbox"
            class="music-checkbox"
            :checked="form.sourceIsUpload"
            @change="patch({ sourceIsUpload: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('music.sourceUpload') }}</span>
        </label>
      </div>
    </div>

    <!-- 底部固定生成 -->
    <div
      v-if="
        form.primaryTab !== 'tools' ||
        form.toolsMode === 'concat' ||
        form.toolsMode === 'persona' ||
        form.toolsMode === 'tags'
      "
      class="shrink-0 border-t border-[var(--music-border-subtle)] bg-[var(--music-surface-sidebar)] px-4 py-3"
    >
      <button
        v-if="form.primaryTab === 'tools' && form.toolsMode === 'tags'"
        type="button"
        class="music-btn-primary music-btn--with-spinner w-full"
        :disabled="tagsExpanding || !form.tags.trim()"
        :aria-busy="tagsExpanding || undefined"
        @click.prevent="emit('expandTags')"
      >
        <span v-if="tagsExpanding" class="music-spin" aria-hidden="true" />
        <MusicIcon v-else name="sparkles" :size="16" />
        {{ tagsExpanding ? t('music.tagsExpanding') : t('music.tagsExpand') }}
      </button>
      <template v-else-if="showLyricsWorkflow && form.useLyricsFirst">
        <MusicActionTooltipWrap :tip="generateLyricsTip" placement="top" block>
          <button
            type="button"
            class="music-btn-secondary music-btn-sm music-btn-block w-full"
            :disabled="submitting || lyricsGenerating || tagsExpanding"
            @click="emit('generateLyrics')"
          >
            {{ lyricsGenerating ? t('music.lyricsGenerating') : t('music.generateLyrics') }}
          </button>
        </MusicActionTooltipWrap>
        <div class="mt-2">
          <MusicActionTooltipWrap :tip="generateMusicTip" placement="top" block>
            <button
              type="button"
              class="music-btn-primary w-full"
              :disabled="submitting || lyricsGenerating || tagsExpanding"
              @click.prevent="emit('submit')"
            >
              {{ submitting ? t('music.generating') : t('music.generateMusic') }}
            </button>
          </MusicActionTooltipWrap>
        </div>
      </template>
      <button
        v-else
        type="button"
        class="music-btn-primary"
        :disabled="submitting || tagsExpanding"
        @click.prevent="emit('submit')"
      >
        {{ submitting ? t('music.generating') : t('music.generate') }}
      </button>
    </div>
  </aside>
</template>
