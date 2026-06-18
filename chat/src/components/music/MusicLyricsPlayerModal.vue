<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import MusicPlayerControls from '@/components/music/MusicPlayerControls.vue'
import { MUSIC_AUDIO_KEY } from '@/constants/musicAudio'
import { t } from '@/locales'
import type { MusicClipItem } from '@/types/music'
import {
  buildLyricsLinesFromAlignedWords,
  buildLyricsLinesFromPrompt,
  extractAlignedWords,
  findActiveLineIndex,
  formatLyricsTime,
  formatLyricsTimeRange,
  isWordActive,
  type LyricsLine,
} from '@/utils/sunoLyricsTiming'
import { computed, inject, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  clip: MusicClipItem | null
  timingData: unknown
  timingLoading?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const audioCtx = inject(MUSIC_AUDIO_KEY, null)
const lyricsScrollRef = ref<HTMLElement | null>(null)
const showTime = ref(true)

const lines = computed((): LyricsLine[] => {
  const aligned = extractAlignedWords(props.timingData)
  if (aligned.length) return buildLyricsLinesFromAlignedWords(aligned)
  const prompt = props.clip?.lyricsText?.trim()
  if (prompt) return buildLyricsLinesFromPrompt(prompt)
  return []
})

const hasTimedLyrics = computed(() => lines.value.some(l => !l.isTag && l.words.length > 0))

const currentTime = computed(() => audioCtx?.currentTime.value ?? 0)
const duration = computed(() => audioCtx?.duration.value ?? props.clip?.duration ?? 0)

const activeIndex = computed(() => {
  if (!hasTimedLyrics.value) return -1
  return findActiveLineIndex(lines.value, currentTime.value)
})

const progressPct = computed(() => {
  const d = duration.value
  if (!d || !Number.isFinite(d)) return 0
  return Math.min(100, (currentTime.value / d) * 100)
})

const isPlaying = computed(() => {
  const clip = props.clip
  if (!clip || !audioCtx) return false
  return audioCtx.isPlaying.value && audioCtx.playingClipId.value === clip.clipId
})

const lyricsCount = computed(() => lines.value.filter(l => !l.isTag).length)

function onSeekInput(e: Event) {
  const el = audioCtx?.audioRef.value
  const d = duration.value
  if (!el || !d) return
  const v = Number((e.target as HTMLInputElement).value)
  el.currentTime = (v / 100) * d
}

function togglePlay() {
  const el = audioCtx?.audioRef.value
  if (!el) return
  if (el.paused) void el.play().catch(() => undefined)
  else el.pause()
}

function onBackdropClick() {
  emit('close')
}

function seekToLine(line: LyricsLine) {
  if (line.isTag || line.startS < 0) return
  const el = audioCtx?.audioRef.value
  if (!el) return
  el.currentTime = line.startS + 0.02
  if (el.paused) void el.play().catch(() => undefined)
}

function wordClass(line: LyricsLine, lineIdx: number, wordIdx: number) {
  if (line.isTag || !line.words.length) return ''
  const state = isWordActive(line, wordIdx, lineIdx, activeIndex.value, currentTime.value)
  if (state === 'current') return 'music-lyrics-word--current'
  if (state === 'past') return 'music-lyrics-word--past'
  return 'music-lyrics-word--future'
}

function lineCardClass(lineIdx: number, line: LyricsLine) {
  if (line.isTag) return 'music-lyrics-tag'
  if (activeIndex.value === lineIdx) return 'music-lyrics-line--active'
  if (activeIndex.value > lineIdx && activeIndex.value >= 0) return 'music-lyrics-line--past'
  return 'music-lyrics-line--idle'
}

watch(activeIndex, async idx => {
  if (idx < 0 || !lyricsScrollRef.value) return
  await nextTick()
  const row = lyricsScrollRef.value.querySelector(`[data-line-idx="${idx}"]`)
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})
</script>

<template>
  <Teleport to="body">
    <Transition name="music-lyrics-fade">
      <div
        v-if="visible"
        class="music-lyrics-overlay music-studio fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-4"
        role="dialog"
        aria-modal="true"
        @click.self="onBackdropClick"
      >
        <div
          class="flex max-h-[min(92vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--music-border-default)] bg-[var(--music-surface-modal)] shadow-2xl md:flex-row"
          @click.stop
        >
          <!-- 左侧：封面 + 播放控制（参考系统） -->
          <aside
            class="flex shrink-0 flex-col border-b border-[var(--music-border-subtle)] bg-[var(--music-surface-toolbar)] p-4 md:w-[220px] md:border-b-0 md:border-r"
          >
            <div class="flex items-start gap-3 md:flex-col md:items-stretch">
              <img
                v-if="clip?.imageUrl"
                :src="clip.imageUrl"
                alt=""
                class="h-16 w-16 shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-[var(--music-border-subtle)] md:h-auto md:w-full md:aspect-square"
              />
              <div
                v-else
                class="music-art-gradient flex h-16 w-16 shrink-0 items-center justify-center rounded-xl md:aspect-square md:h-auto md:w-full"
              >
                <MusicIcon name="music" :size="28" />
              </div>
              <div class="min-w-0 flex-1 md:mt-1">
                <h3
                  class="line-clamp-2 text-sm font-semibold text-[var(--text-primary)] md:text-base"
                >
                  {{ clip?.title || '—' }}
                </h3>
                <p class="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {{
                    hasTimedLyrics ? t('music.lyricsPlayerSynced') : t('music.lyricsPlayerStatic')
                  }}
                </p>
              </div>
            </div>

            <div class="mt-4 flex flex-col gap-3">
              <MusicPlayerControls
                compact
                :playing="isPlaying"
                :disabled="!clip?.audioUrl"
                @toggle="togglePlay"
              />

              <div
                class="flex items-center gap-2 text-[10px] tabular-nums text-[var(--text-muted)]"
              >
                <span class="w-8 shrink-0 text-right">{{ formatLyricsTime(currentTime) }}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  class="music-progress-range min-w-0 flex-1"
                  :value="progressPct"
                  @input="onSeekInput"
                />
                <span class="w-8 shrink-0">{{ formatLyricsTime(duration) }}</span>
              </div>

              <dl class="grid grid-cols-2 gap-2 text-[10px] text-[var(--text-muted)]">
                <div class="rounded-lg bg-[var(--music-surface-field)] px-2 py-1.5">
                  <dt>{{ t('music.lyricsPlayerTotalDuration') }}</dt>
                  <dd class="mt-0.5 font-medium tabular-nums music-text-accent">
                    {{ formatLyricsTime(duration) }}
                  </dd>
                </div>
                <div class="rounded-lg bg-[var(--music-surface-field)] px-2 py-1.5">
                  <dt>{{ t('music.lyricsPlayerLineCount') }}</dt>
                  <dd class="mt-0.5 font-medium tabular-nums music-text-accent">
                    {{ lyricsCount }}
                  </dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              class="music-btn-ghost music-btn-sm"
              @click="showTime = !showTime"
            >
              {{ showTime ? t('music.lyricsPlayerHideTime') : t('music.lyricsPlayerShowTime') }}
            </button>
          </aside>

          <!-- 右侧：歌词 + 时间轴 -->
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <header
              class="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--music-border-subtle)] px-4 py-3"
            >
              <p class="text-xs text-[var(--text-muted)]">
                {{ t('music.lyricsPlayerCurrentTime') }}
                <span class="ml-1 font-medium tabular-nums music-text-accent">
                  {{ formatLyricsTime(currentTime) }}
                </span>
              </p>
              <button
                type="button"
                class="music-modal-close music-btn-ghost music-btn-sm !h-8 !w-8 !min-h-0 rounded-full p-0"
                aria-label="Close"
                @click="emit('close')"
              >
                <MusicIcon name="close" :size="16" />
              </button>
            </header>

            <div
              ref="lyricsScrollRef"
              class="custom-scrollbar min-h-[200px] flex-1 overflow-y-auto px-4 py-4 md:px-5"
            >
              <div
                v-if="timingLoading"
                class="flex flex-col items-center justify-center gap-3 py-16"
              >
                <span class="music-page-loading__orb" aria-hidden="true" />
                <p class="text-sm text-[var(--text-muted)]">{{ t('music.lyricsPlayerLoading') }}</p>
              </div>
              <p
                v-else-if="!lines.length"
                class="py-12 text-center text-sm text-[var(--text-muted)]"
              >
                {{ t('music.lyricsPlayerEmpty') }}
              </p>
              <ul v-else class="music-lyrics-list flex flex-col gap-1.5">
                <li
                  v-for="(line, idx) in lines"
                  :key="line.id"
                  :data-line-idx="idx"
                  class="music-lyrics-line rounded-lg border px-2.5 py-2 transition-colors duration-200"
                  :class="[
                    lineCardClass(idx, line),
                    !line.isTag && line.endS > 0 ? 'cursor-pointer hover:border-violet-400/30' : '',
                  ]"
                  @click="seekToLine(line)"
                >
                  <p v-if="line.isTag" class="music-lyrics-tag-text">
                    {{ line.text }}
                  </p>
                  <div
                    v-else
                    class="music-lyrics-line-body"
                    :class="{ 'music-lyrics-line-body--no-time': !showTime || line.endS <= 0 }"
                  >
                    <time
                      v-if="showTime && line.endS > 0"
                      class="music-lyrics-line-time"
                      :datetime="`PT${line.startS}S`"
                    >
                      {{ formatLyricsTimeRange(line.startS, line.endS) }}
                    </time>
                    <p v-if="line.words.length && hasTimedLyrics" class="music-lyrics-words">
                      <span
                        v-for="(w, wi) in line.words"
                        :key="`${line.id}-w-${wi}`"
                        class="music-lyrics-word"
                        :class="wordClass(line, idx, wi)"
                        >{{ w.text }}</span
                      >
                    </p>
                    <p
                      v-else
                      class="music-lyrics-words music-lyrics-words--plain"
                      :class="{ 'is-active': activeIndex === idx }"
                    >
                      {{ line.text }}
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            <footer
              class="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--music-border-subtle)] px-4 py-2 md:hidden"
            >
              <button
                type="button"
                class="music-btn-ghost music-btn-sm"
                @click="showTime = !showTime"
              >
                {{ showTime ? t('music.lyricsPlayerHideTime') : t('music.lyricsPlayerShowTime') }}
              </button>
            </footer>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
