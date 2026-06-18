<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import { t } from '@/locales'
import type { MusicClipItem, MusicProcessMode } from '@/types/music'
import {
  isClipGenerationSettled,
  isClipPlayable,
  displayStatusForClip,
} from '@/utils/musicClipPlaybackReady'
import { stemKindLabelKey, sortStemClips } from '@/utils/sunoStemUtils'
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  sourceClip: MusicClipItem | null
  stemClips: MusicClipItem[]
  submitting?: boolean
  playingClipId?: string
}>()

const emit = defineEmits<{
  close: []
  submit: [MusicProcessMode]
  play: [MusicClipItem]
  download: [MusicClipItem]
  useAsTarget: [MusicClipItem]
}>()

const sortedStems = computed(() => sortStemClips(props.stemClips))

const hasStems = computed(() => sortedStems.value.length > 0)

const stemsLoading = computed(() => sortedStems.value.some(c => !isClipGenerationSettled(c)))

const completedCount = computed(() => sortedStems.value.filter(c => isClipPlayable(c)).length)

function isPlayingClip(clip: MusicClipItem) {
  return props.playingClipId === clip.clipId
}

function toggleStemPlay(clip: MusicClipItem) {
  if (!isClipPlayable(clip)) return
  emit('play', clip)
}

function statusText(clip: MusicClipItem) {
  const map: Record<string, string> = {
    submitted: 'music.statusSubmitted',
    queued: 'music.statusQueued',
    streaming: 'music.statusStreaming',
    complete: 'music.statusComplete',
    error: 'music.statusError',
  }
  return t(map[clip.status] || 'music.statusSubmitted')
}
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="t('music.stemModalTitle')"
    :subtitle="t('music.stemModalDesc')"
    :aria-label="t('music.stemModalTitle')"
    max-width="2xl"
    @close="emit('close')"
  >
    <section v-if="sourceClip" class="mb-5">
      <p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {{ t('music.stemModalSource') }}
      </p>
      <div class="music-surface-accent flex gap-3 rounded-xl p-3">
        <img
          v-if="sourceClip.imageUrl"
          :src="sourceClip.imageUrl"
          alt=""
          class="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-[var(--music-border-subtle)]"
        />
        <div
          v-else
          class="music-art-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
        >
          <MusicIcon name="music" :size="22" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-sm font-medium text-[var(--text-primary)]">
            {{ sourceClip.title || sourceClip.clipId.slice(0, 8) }}
          </h3>
          <p class="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            {{ sourceClip.clipId }}
          </p>
        </div>
      </div>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {{ t('music.stemModalStems') }}
        </p>
        <span v-if="hasStems" class="music-badge text-[10px]">
          {{ t('music.stemModalStemsCount', { n: sortedStems.length }) }}
        </span>
      </div>

      <div
        v-if="submitting || (stemsLoading && !hasStems)"
        class="flex items-center gap-3 rounded-xl border border-[var(--music-border-subtle)] bg-[var(--music-surface-field)] px-4 py-6"
      >
        <span class="music-spin" aria-hidden="true" />
        <p class="text-sm music-text-accent">
          {{ t('music.stemModalLoading') }}
        </p>
      </div>

      <p
        v-else-if="!hasStems"
        class="rounded-xl border border-dashed border-[var(--music-border-default)] px-4 py-8 text-center text-sm text-[var(--text-muted)]"
      >
        {{ t('music.stemModalEmpty') }}
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="stem in sortedStems"
          :key="stem.id"
          class="flex items-center gap-3 rounded-xl border border-[var(--music-border-subtle)] bg-[var(--music-surface-card)] p-3"
        >
          <button
            type="button"
            class="music-play-mini h-10 w-10 shrink-0"
            :disabled="stem.status !== 'complete' || !stem.audioUrl"
            @click="toggleStemPlay(stem)"
          >
            <MusicIcon :name="isPlayingClip(stem) ? 'pause' : 'play'" :size="16" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-[var(--text-primary)]">
              {{ t(stemKindLabelKey(stem.stemKind || 'other')) }}
            </p>
            <p class="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {{ stem.title || stem.clipId.slice(0, 12) }}
            </p>
            <p class="mt-0.5 text-[10px] text-[var(--text-muted)]">
              {{ statusText(stem) }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col gap-1 sm:flex-row">
            <button
              type="button"
              class="music-action-btn"
              :disabled="stem.status !== 'complete' || !stem.audioUrl"
              @click="emit('download', stem)"
            >
              {{ t('music.download') }}
            </button>
            <button
              type="button"
              class="music-action-btn music-action-btn--violet"
              :disabled="stem.status !== 'complete'"
              @click="emit('useAsTarget', stem)"
            >
              {{ t('music.useAsTarget') }}
            </button>
          </div>
        </li>
      </ul>

      <p
        v-if="hasStems && completedCount > 0"
        class="mt-3 text-center text-[11px] text-emerald-400/80"
      >
        {{ t('music.stemModalReady', { n: completedCount }) }}
      </p>
    </section>

    <template #footer>
      <button
        type="button"
        class="music-btn-secondary music-btn-sm flex-1"
        :disabled="submitting || !sourceClip"
        @click="emit('submit', 'vocal_stems')"
      >
        {{ t('music.stemSubmitVocal') }}
      </button>
      <button
        type="button"
        class="music-btn-secondary music-btn-sm flex-1"
        :disabled="submitting || !sourceClip"
        @click="emit('submit', 'all_stems')"
      >
        {{ t('music.stemSubmitAll') }}
      </button>
    </template>
  </MusicModalShell>
</template>
