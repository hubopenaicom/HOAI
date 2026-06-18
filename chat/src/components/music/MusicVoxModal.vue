<script setup lang="ts">
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import { t } from '@/locales'
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  clipTitle?: string
  clipDuration?: number
  submitting?: boolean
  resultUrl?: string
}>()

const emit = defineEmits<{
  close: []
  submit: [payload: { vocal_start_s: number; vocal_end_s: number }]
}>()

const startS = ref(0)
const endS = ref(30)

watch(
  () => props.visible,
  open => {
    if (!open) return
    const d = props.clipDuration
    startS.value = 0
    endS.value = d != null && d > 0 ? Math.min(d, Math.max(10, d)) : 30
  }
)

function onSubmit() {
  emit('submit', { vocal_start_s: startS.value, vocal_end_s: endS.value })
}
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="t('music.voxTitle')"
    :subtitle="clipTitle"
    :aria-label="t('music.voxTitle')"
    max-width="md"
    @close="emit('close')"
  >
    <p class="text-xs leading-relaxed text-[var(--text-muted)]">{{ t('music.voxHint') }}</p>
    <div class="mt-4 grid grid-cols-2 gap-3">
      <div>
        <label class="text-xs text-[var(--text-muted)]">{{ t('music.timeStart') }}</label>
        <input
          v-model.number="startS"
          type="number"
          min="0"
          step="0.1"
          class="music-input mt-1 w-full"
        />
      </div>
      <div>
        <label class="text-xs text-[var(--text-muted)]">{{ t('music.timeEnd') }}</label>
        <input
          v-model.number="endS"
          type="number"
          min="0"
          step="0.1"
          class="music-input mt-1 w-full"
        />
      </div>
    </div>
    <div v-if="resultUrl" class="mt-4">
      <a
        :href="resultUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="music-btn-secondary music-btn-sm inline-flex"
      >
        {{ t('music.voxPlay') }}
      </a>
    </div>

    <template #footer>
      <button type="button" class="music-btn-ghost music-btn-sm" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="music-btn-primary music-btn-sm"
        :disabled="submitting"
        @click="onSubmit"
      >
        {{ submitting ? t('music.voxSubmitting') : t('music.voxSubmit') }}
      </button>
    </template>
  </MusicModalShell>
</template>
