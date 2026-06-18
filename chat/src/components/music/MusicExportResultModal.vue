<script setup lang="ts">
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import MusicIcon from '@/components/music/MusicIcon.vue'
import { t } from '@/locales'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  kind: 'wav' | 'mp4'
  clipTitle?: string
  url?: string
  loading?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const title = computed(() =>
  props.kind === 'wav' ? t('music.exportResultWavTitle') : t('music.exportResultMp4Title')
)

const hint = computed(() =>
  props.kind === 'wav' ? t('music.exportResultWavHint') : t('music.exportResultMp4Hint')
)

function onCopyUrl() {
  if (!props.url) return
  copyText({ text: props.url })
  message.success(t('music.copied'))
}

function onOpen() {
  if (!props.url) return
  window.open(props.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="title"
    :subtitle="clipTitle"
    :aria-label="title"
    max-width="lg"
    @close="emit('close')"
  >
    <div
      v-if="loading"
      class="flex flex-col items-center gap-3 py-8"
      role="status"
      aria-busy="true"
    >
      <span class="music-page-loading__orb" aria-hidden="true" />
      <p class="text-sm text-[var(--text-muted)]">
        {{ kind === 'wav' ? t('music.exportWavPolling') : t('music.exportMp4Polling') }}
      </p>
    </div>

    <template v-else-if="url">
      <p class="text-xs leading-relaxed text-[var(--text-muted)]">{{ hint }}</p>

      <div
        class="mt-4 overflow-hidden rounded-xl border border-[var(--music-border-subtle)] bg-[var(--music-surface-panel)]"
      >
        <video
          v-if="kind === 'mp4'"
          :src="url"
          controls
          playsinline
          class="max-h-64 w-full bg-black"
        />
        <audio v-else :src="url" controls class="w-full p-3" />
      </div>

      <p class="mt-3 break-all font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
        {{ url }}
      </p>
    </template>

    <p v-else class="text-sm text-[var(--text-muted)]">{{ t('music.exportPending') }}</p>

    <template #footer>
      <button type="button" class="music-btn-ghost music-btn-sm" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        v-if="url && !loading"
        type="button"
        class="music-btn-secondary music-btn-sm inline-flex items-center gap-1.5"
        @click="onCopyUrl"
      >
        <MusicIcon name="copy" :size="14" />
        {{ t('music.exportResultCopyUrl') }}
      </button>
      <a
        v-if="url && !loading"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="music-btn-secondary music-btn-sm inline-flex items-center gap-1.5"
      >
        <MusicIcon name="download" :size="14" />
        {{ t('music.exportResultDownload') }}
      </a>
      <button
        v-if="url && !loading"
        type="button"
        class="music-btn-primary music-btn-sm inline-flex items-center gap-1.5"
        @click="onOpen"
      >
        <MusicIcon name="link" :size="14" />
        {{ t('music.exportResultOpenNew') }}
      </button>
    </template>
  </MusicModalShell>
</template>
