<script setup lang="ts">
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import { t } from '@/locales'
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  clipTitle?: string
  timingData: unknown
}>()

const emit = defineEmits<{ close: [] }>()

interface AlignedWord {
  word?: string
  start_s?: number
  end_s?: number
}

const words = computed((): AlignedWord[] => {
  const d = props.timingData
  if (!d || typeof d !== 'object') return []
  const o = d as Record<string, unknown>
  const raw = o.aligned_words ?? o.data
  if (Array.isArray(raw)) return raw as AlignedWord[]
  return []
})

const jsonPreview = computed(() => {
  try {
    return JSON.stringify(props.timingData, null, 2)
  } catch {
    return String(props.timingData)
  }
})
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="t('music.timingTitle')"
    :subtitle="clipTitle"
    :aria-label="t('music.timingTitle')"
    max-width="2xl"
    @close="emit('close')"
  >
    <table v-if="words.length" class="w-full text-xs">
      <thead>
        <tr class="border-b border-[var(--music-border-subtle)] text-left text-[var(--text-muted)]">
          <th class="pb-2 pr-2">{{ t('music.timingWord') }}</th>
          <th class="pb-2 pr-2">{{ t('music.timeStart') }}</th>
          <th class="pb-2">{{ t('music.timeEnd') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(w, i) in words.slice(0, 200)"
          :key="i"
          class="border-b border-[var(--music-border-subtle)]/50"
        >
          <td class="whitespace-pre-wrap py-1.5 pr-2 font-mono">{{ w.word }}</td>
          <td class="py-1.5 pr-2">{{ w.start_s?.toFixed(2) }}</td>
          <td class="py-1.5">{{ w.end_s?.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
    <pre
      v-else
      class="overflow-x-auto rounded-lg bg-[var(--music-surface-panel)] p-3 text-xs leading-relaxed"
      >{{ jsonPreview }}</pre
    >

    <template #footer>
      <button type="button" class="music-btn-primary music-btn-sm" @click="emit('close')">
        {{ t('common.confirm') }}
      </button>
    </template>
  </MusicModalShell>
</template>
