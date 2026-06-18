<script setup lang="ts">
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import MusicIcon from '@/components/music/MusicIcon.vue'
import { t } from '@/locales'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import {
  extractMidiDownloadUrl,
  parseMidiInstruments,
  type MidiInstrument,
} from '@/utils/sunoExportPoll'
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  clipTitle?: string
  midiData: unknown
  loading?: boolean
}>()

const emit = defineEmits<{ close: []; download: [] }>()

const instruments = computed((): MidiInstrument[] => parseMidiInstruments(props.midiData))

const totalNotes = computed(() =>
  instruments.value.reduce((sum, inst) => sum + (inst.notes?.length ?? 0), 0)
)

const downloadUrl = computed(() => extractMidiDownloadUrl(props.midiData))

const jsonPreview = computed(() => {
  try {
    return JSON.stringify(props.midiData, null, 2)
  } catch {
    return String(props.midiData)
  }
})

function onCopyJson() {
  copyText({ text: jsonPreview.value })
  message.success(t('music.copied'))
}
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="t('music.midiTitle')"
    :subtitle="clipTitle"
    :aria-label="t('music.midiTitle')"
    max-width="2xl"
    @close="emit('close')"
  >
    <div
      v-if="loading"
      class="flex flex-col items-center gap-3 py-8"
      role="status"
      aria-busy="true"
    >
      <span class="music-page-loading__orb" aria-hidden="true" />
      <p class="text-sm text-[var(--text-muted)]">{{ t('music.midiLoading') }}</p>
      <p class="max-w-sm text-center text-xs leading-relaxed text-[var(--text-muted)]">
        {{ t('music.midiLoadingHint') }}
      </p>
    </div>

    <template v-else>
      <div
        class="rounded-xl border border-cyan-500/25 bg-cyan-500/8 px-3 py-2.5 text-xs leading-relaxed text-[var(--text-secondary)]"
      >
        {{ t('music.midiGuide') }}
      </div>

      <p v-if="instruments.length" class="mt-4 text-xs text-[var(--text-muted)]">
        {{ t('music.midiSummary', { tracks: instruments.length, notes: totalNotes }) }}
      </p>

      <div v-if="instruments.length" class="mt-4 flex flex-col gap-3">
        <section
          v-for="(inst, idx) in instruments"
          :key="idx"
          class="rounded-xl border border-[var(--music-border-subtle)] bg-[var(--music-surface-panel)] p-3"
        >
          <h4 class="text-sm font-medium music-text-accent">
            {{ inst.name || t('music.midiTrack', { n: idx + 1 }) }}
          </h4>
          <p class="mt-1 text-[11px] text-[var(--text-muted)]">
            {{ t('music.midiNoteCount', { n: inst.notes?.length ?? 0 }) }}
          </p>
          <table v-if="inst.notes?.length" class="mt-2 w-full text-xs">
            <thead>
              <tr class="text-left text-[var(--text-muted)]">
                <th class="pb-1 pr-2">{{ t('music.midiPitch') }}</th>
                <th class="pb-1 pr-2">{{ t('music.timeStart') }}</th>
                <th class="pb-1">{{ t('music.timeEnd') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(n, ni) in inst.notes.slice(0, 12)" :key="ni">
                <td class="py-0.5 pr-2">{{ n.pitch }}</td>
                <td class="py-0.5 pr-2">{{ n.start?.toFixed(2) }}</td>
                <td class="py-0.5">{{ n.end?.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="inst.notes && inst.notes.length > 12"
            class="mt-1 text-[10px] text-[var(--text-muted)]"
          >
            {{ t('music.midiMoreNotes', { n: inst.notes.length - 12 }) }}
          </p>
        </section>
      </div>

      <details
        class="mt-4 rounded-xl border border-[var(--music-border-subtle)] bg-[var(--music-surface-panel)]"
      >
        <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
          {{ t('music.midiRawJson') }}
        </summary>
        <pre
          class="max-h-48 overflow-auto border-t border-[var(--music-border-subtle)] p-3 text-xs leading-relaxed"
          >{{ jsonPreview }}</pre
        >
      </details>
    </template>

    <template #footer>
      <button type="button" class="music-btn-ghost music-btn-sm" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        v-if="midiData && !loading"
        type="button"
        class="music-btn-secondary music-btn-sm inline-flex items-center gap-1.5"
        @click="onCopyJson"
      >
        <MusicIcon name="copy" :size="14" />
        {{ t('music.midiCopyJson') }}
      </button>
      <a
        v-if="downloadUrl && !loading"
        :href="downloadUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="music-btn-secondary music-btn-sm inline-flex items-center gap-1.5"
      >
        <MusicIcon name="download" :size="14" />
        {{ t('music.midiDownloadFile') }}
      </a>
      <button
        v-if="midiData && !loading"
        type="button"
        class="music-btn-primary music-btn-sm inline-flex items-center gap-1.5"
        @click="emit('download')"
      >
        <MusicIcon name="download" :size="14" />
        {{ t('music.midiDownload') }}
      </button>
    </template>
  </MusicModalShell>
</template>
