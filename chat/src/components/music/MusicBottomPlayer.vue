<script setup lang="ts">
import MusicAudioVisualizer from '@/components/music/MusicAudioVisualizer.vue'
import MusicPlayerControls from '@/components/music/MusicPlayerControls.vue'
import MusicTurntable from '@/components/music/MusicTurntable.vue'
import { t } from '@/locales'
import type { MusicClipItem } from '@/types/music'
import { computed } from 'vue'

const props = defineProps<{
  clip?: MusicClipItem
  playing?: boolean
  isPlaying?: boolean
  currentTime: number
  duration: number
  progressPct: number
  volume: number
  barHeights: number[]
  visualizerActive?: boolean
  hasPlayable?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  prev: []
  next: []
  seek: [Event]
  volumeInput: [Event]
  openLyrics: []
}>()

const formatTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

const statusText = computed(() => {
  if (!props.clip) return t('music.playerIdleHint')
  if (props.isPlaying) return t('music.playerNowPlaying')
  return t('music.playerPaused')
})

const volumePct = computed(() => Math.round(props.volume * 100))

const volumeTrackStyle = computed(() => {
  const p = volumePct.value
  return {
    background: `linear-gradient(to right, #22c55e 0%, #3b82f6 ${p}%, rgba(255,255,255,0.12) ${p}%, rgba(255,255,255,0.12) 100%)`,
  }
})
</script>

<template>
  <div class="music-player-dock shrink-0">
    <footer class="music-player-panel">
      <div
        v-if="clip"
        class="music-player-panel-inner music-player-compact grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3 py-2 sm:px-4"
      >
        <div class="music-player-turntable-slot row-span-2 self-center">
          <MusicTurntable
            embed
            :image-url="clip.imageUrl"
            :playing="!!playing && isPlaying"
            :size="72"
            @toggle="emit('toggle')"
          />
        </div>

        <div class="flex min-w-0 items-center justify-between gap-2">
          <div class="min-w-0 flex-1 leading-tight">
            <p class="truncate text-[13px] font-semibold text-[var(--text-primary)]">
              {{ clip.title || clip.clipId.slice(0, 12) }}
            </p>
            <p class="truncate text-[10px] music-text-accent">
              {{ clip.sceneLabel || statusText }}
            </p>
          </div>
          <div
            class="music-player-viz-wrap shrink-0 rounded-lg border border-[var(--music-border-subtle)] bg-[var(--music-surface-field)] px-2 py-1"
          >
            <MusicAudioVisualizer
              :heights="barHeights"
              :active="visualizerActive"
              variant="boxed"
              compact
            />
          </div>
        </div>

        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <MusicPlayerControls
            class="music-player-controls--bar shrink-0"
            :playing="isPlaying"
            :disabled="!hasPlayable"
            @toggle="emit('toggle')"
            @prev="emit('prev')"
            @next="emit('next')"
          />

          <div
            class="flex min-w-[8rem] flex-1 items-center gap-1.5 text-[10px] tabular-nums text-[var(--text-muted)]"
          >
            <span class="w-7 shrink-0 text-right">{{ formatTime(currentTime) }}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              class="music-progress-range min-w-0 flex-1"
              :value="progressPct"
              :disabled="!clip"
              @input="emit('seek', $event)"
            />
            <span class="w-7 shrink-0">{{ formatTime(duration) }}</span>
          </div>

          <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <svg
              viewBox="0 0 24 24"
              class="hidden h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] sm:block"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
              />
            </svg>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              class="music-volume-range hidden w-14 sm:block"
              :style="volumeTrackStyle"
              :value="volumePct"
              @input="emit('volumeInput', $event)"
            />
            <button
              type="button"
              class="music-btn-secondary music-btn-sm shrink-0"
              @click="emit('openLyrics')"
            >
              {{ t('music.lyricsPlayerBtn') }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="music-player-panel-inner flex items-center gap-3 px-3 py-2 sm:px-4">
        <div class="music-player-turntable-slot">
          <MusicTurntable embed :playing="false" :size="64" @toggle="emit('toggle')" />
        </div>
        <div class="min-w-0 flex-1 leading-tight">
          <p class="text-[13px] font-medium text-[var(--text-primary)]">
            {{ t('music.playerIdle') }}
          </p>
          <p class="text-[10px] text-[var(--text-muted)]">{{ t('music.playerIdleHint') }}</p>
        </div>
      </div>
    </footer>
  </div>
</template>
