<script setup lang="ts">
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import { SUNO_DEFAULT_MODEL_VERSION, SUNO_MV_SELECT_OPTIONS } from '@/types/music'
import type { MusicClipItem } from '@/types/music'
import { t } from '@/locales'
import { isClipPlayable } from '@/utils/musicClipPlaybackReady'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  submitting?: boolean
  clips: MusicClipItem[]
  defaultSourceClipId?: string
  defaultContinueAt?: number | null
}>()

const emit = defineEmits<{
  close: []
  extend: [
    payload: {
      sourceClipId: string
      continueAt: number
      mv: string
      prompt: string
      tags: string
      title: string
    },
  ]
  concat: [payload: { extendedClipId: string; isInfill: boolean }]
}>()

const step = ref(1)
const sourceClipId = ref('')
const continueAt = ref<number | null>(null)
const mv = ref(SUNO_DEFAULT_MODEL_VERSION)
const prompt = ref('')
const tags = ref('')
const title = ref('')
const extendedClipId = ref('')
const concatIsInfill = ref(false)

function resetWizardState() {
  step.value = 1
  sourceClipId.value = props.defaultSourceClipId || ''
  continueAt.value = props.defaultContinueAt ?? null
  extendedClipId.value = ''
  concatIsInfill.value = false
  mv.value = SUNO_DEFAULT_MODEL_VERSION
}

watch(
  () => props.visible,
  v => {
    if (!v) return
    resetWizardState()
  }
)

const extendCandidates = computed(() =>
  props.clips.filter(c => isClipPlayable(c) && !c.parentClipId)
)

const canExtend = computed(
  () => sourceClipId.value.trim() && continueAt.value != null && Number.isFinite(continueAt.value)
)
const canConcat = computed(() => extendedClipId.value.trim())

function onExtend() {
  if (!canExtend.value) return
  emit('extend', {
    sourceClipId: sourceClipId.value.trim(),
    continueAt: continueAt.value as number,
    mv: mv.value,
    prompt: prompt.value.trim(),
    tags: tags.value.trim(),
    title: title.value.trim(),
  })
}

function notifyExtendSubmitted(clipIds: string | string[]) {
  const id = Array.isArray(clipIds) ? clipIds[0] : clipIds
  if (!id) return
  extendedClipId.value = id
  step.value = 2
}

function notifyExtendComplete(clipId: string) {
  extendedClipId.value = clipId
  step.value = 3
}

defineExpose({ notifyExtendSubmitted, notifyExtendComplete })
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="t('music.wizardTitle')"
    :subtitle="t('music.wizardSubtitle')"
    :aria-label="t('music.wizardTitle')"
    max-width="lg"
    @close="emit('close')"
  >
    <ul class="music-steps">
      <li class="music-step" :class="{ 'is-done': step >= 1 }">{{ t('music.wizardStep1') }}</li>
      <li class="music-step" :class="{ 'is-done': step >= 2 }">{{ t('music.wizardStep2') }}</li>
      <li class="music-step" :class="{ 'is-done': step >= 3 }">{{ t('music.wizardStep3') }}</li>
    </ul>

    <div class="mt-4 space-y-3">
      <template v-if="step === 1">
        <input
          v-model="sourceClipId"
          type="text"
          class="music-input music-input--mono"
          :placeholder="t('music.targetClipPlaceholder')"
        />
        <label class="music-form-label">{{ t('music.continueAtLabel') }}</label>
        <input v-model.number="continueAt" type="number" min="0" step="0.1" class="music-input" />
        <label class="music-form-label">{{ t('music.selectVersion') }}</label>
        <select v-model="mv" class="music-select text-sm">
          <option v-for="opt in SUNO_MV_SELECT_OPTIONS" :key="opt.value" :value="opt.value">
            {{ t(opt.labelKey) }}
          </option>
        </select>
        <label class="music-form-label">{{ t('music.promptLabel') }}</label>
        <textarea
          v-model="prompt"
          class="music-textarea min-h-[80px] text-sm"
          :placeholder="t('music.promptPlaceholder')"
        />
        <input
          v-model="tags"
          type="text"
          class="music-input text-sm"
          :placeholder="t('music.tagsPlaceholder')"
        />
        <input
          v-model="title"
          type="text"
          class="music-input text-sm"
          :placeholder="t('music.titlePlaceholder')"
        />
      </template>

      <template v-else-if="step === 2">
        <p class="text-sm text-[var(--text-secondary)]">{{ t('music.wizardStep2Hint') }}</p>
        <div v-if="extendCandidates.length" class="flex flex-col gap-2">
          <label v-for="c in extendCandidates" :key="c.clipId" class="music-radio-card">
            <input v-model="extendedClipId" type="radio" class="music-radio" :value="c.clipId" />
            <span class="min-w-0 flex-1 truncate text-xs">
              {{ c.title }} · {{ c.status }}
              <span class="font-mono text-[10px] text-[var(--text-muted)]">{{ c.clipId }}</span>
            </span>
          </label>
        </div>
        <input
          v-else
          v-model="extendedClipId"
          type="text"
          class="music-input music-input--mono"
          :placeholder="t('music.concatClipLabel')"
        />
        <button type="button" class="music-btn-secondary music-btn-sm" @click="step = 3">
          {{ t('music.wizardGoConcat') }}
        </button>
      </template>

      <template v-else>
        <p class="text-sm text-[var(--text-secondary)]">{{ t('music.wizardStep3Hint') }}</p>
        <input
          v-model="extendedClipId"
          type="text"
          class="music-input music-input--mono"
          :placeholder="t('music.concatClipLabel')"
        />
        <label class="music-check-row">
          <input v-model="concatIsInfill" type="checkbox" class="music-checkbox" />
          <span>{{ t('music.concatIsInfill') }}</span>
        </label>
      </template>
    </div>

    <template #footer>
      <button type="button" class="music-btn-ghost music-btn-sm" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        v-if="step === 1"
        type="button"
        class="music-btn-primary music-btn-sm !w-auto px-5"
        :disabled="submitting || !canExtend"
        @click="onExtend"
      >
        {{ submitting ? t('music.generating') : t('music.wizardRunExtend') }}
      </button>
      <button
        v-if="step >= 2"
        type="button"
        class="music-btn-primary music-btn-sm !w-auto px-5"
        :disabled="submitting || !canConcat"
        @click="emit('concat', { extendedClipId: extendedClipId.trim(), isInfill: concatIsInfill })"
      >
        {{ submitting ? t('music.generating') : t('music.wizardRunConcat') }}
      </button>
    </template>
  </MusicModalShell>
</template>
