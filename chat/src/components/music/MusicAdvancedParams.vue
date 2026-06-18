<script setup lang="ts">
import { t } from '@/locales'
import type { MusicFormState } from '@/types/music'

const props = defineProps<{
  form: MusicFormState
  showCoverSliders?: boolean
}>()

const emit = defineEmits<{ 'update:form': [MusicFormState] }>()

function patch(partial: Partial<MusicFormState>) {
  emit('update:form', { ...props.form, ...partial })
}

function onSlider(key: 'styleWeight' | 'weirdnessConstraint' | 'audioWeight', e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const v = raw === '' ? null : Number(raw)
  patch({ [key]: v != null && Number.isFinite(v) ? v : null })
}
</script>

<template>
  <details class="music-details music-advanced-params">
    <summary class="cursor-pointer text-xs font-medium music-text-accent">
      {{ t('music.advancedParamsTitle') }}
    </summary>
    <div class="music-details__body mt-2 flex flex-col gap-3">
      <p class="text-[10px] leading-relaxed text-[var(--text-muted)]">
        {{ t('music.advancedParamsHint') }}
      </p>

      <div>
        <label class="music-form-label">{{ t('music.negativeTagsLabel') }}</label>
        <input
          :value="form.negativeTags"
          type="text"
          class="music-input mt-1 text-sm"
          :placeholder="t('music.negativeTagsPlaceholder')"
          @input="patch({ negativeTags: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div>
        <label class="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{{ t('music.styleWeightLabel') }}</span>
          <span class="font-mono tabular-nums">{{
            form.styleWeight != null ? form.styleWeight.toFixed(2) : '—'
          }}</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="music-range mt-1 w-full"
          :value="form.styleWeight ?? 0.5"
          @input="onSlider('styleWeight', $event)"
        />
      </div>

      <div>
        <label class="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{{ t('music.weirdnessLabel') }}</span>
          <span class="font-mono tabular-nums">{{
            form.weirdnessConstraint != null ? form.weirdnessConstraint.toFixed(2) : '—'
          }}</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="music-range mt-1 w-full"
          :value="form.weirdnessConstraint ?? 0.5"
          @input="onSlider('weirdnessConstraint', $event)"
        />
      </div>

      <div v-if="showCoverSliders">
        <label class="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{{ t('music.audioWeightLabel') }}</span>
          <span class="font-mono tabular-nums">{{
            form.audioWeight != null ? form.audioWeight.toFixed(2) : '—'
          }}</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="music-range mt-1 w-full"
          :value="form.audioWeight ?? 0.5"
          @input="onSlider('audioWeight', $event)"
        />
      </div>

      <div>
        <label class="music-form-label">{{ t('music.vocalGenderLabel') }}</label>
        <select
          class="music-select mt-1 w-full text-sm"
          :value="form.vocalGender"
          @change="
            patch({
              vocalGender: ($event.target as HTMLSelectElement)
                .value as MusicFormState['vocalGender'],
            })
          "
        >
          <option value="">{{ t('music.vocalGenderDefault') }}</option>
          <option value="f">{{ t('music.vocalGenderFemale') }}</option>
          <option value="m">{{ t('music.vocalGenderMale') }}</option>
        </select>
      </div>
    </div>
  </details>
</template>
