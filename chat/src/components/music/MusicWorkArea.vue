<script setup lang="ts">
import MusicActionTooltipWrap from '@/components/music/MusicActionTooltipWrap.vue'
import MusicBottomPlayer from '@/components/music/MusicBottomPlayer.vue'
import MusicIcon from '@/components/music/MusicIcon.vue'
import MusicLyricsPlayerModal from '@/components/music/MusicLyricsPlayerModal.vue'
import { MUSIC_EDIT_ICON, MUSIC_PROCESS_ICON } from '@/constants/musicIcons'
import {
  MUSIC_DETAIL_EDIT_ACTIONS,
  MUSIC_DETAIL_PROCESS_ACTIONS,
  type MusicDetailActionKind,
} from '@/utils/musicDetailActions'
import { resolveDetailActionTooltipKey } from '@/utils/musicDetailActionTooltips'
import { useMusicAudioAnalyser } from '@/composables/useMusicAudioAnalyser'
import { MUSIC_AUDIO_KEY } from '@/constants/musicAudio'
import { t } from '@/locales'
import type { MusicClipItem, MusicEditMode, MusicProcessMode, SunoTaskStatus } from '@/types/music'
import { getStemsForSource, listClipsWithoutStemChildren } from '@/utils/sunoStemUtils'
import { canUsePersonaSing } from '@/utils/sunoCapabilityGuards'
import { displayStatusForClip, isClipPlayable } from '@/utils/musicClipPlaybackReady'
import { message } from '@/utils/message'
import { computed, provide, ref, toRef, watch } from 'vue'

const props = defineProps<{
  clips: MusicClipItem[]
  jobsHydrating?: boolean
  activeClipId?: string
  playingClipId?: string
  detailActionBusy?: MusicDetailActionKind | null
  lyricsPlayerVisible?: boolean
  lyricsPlayerClip?: MusicClipItem | null
  lyricsTimingData?: unknown
  lyricsTimingLoading?: boolean
}>()

const emit = defineEmits<{
  select: [MusicClipItem]
  openDetail: [MusicClipItem]
  play: [MusicClipItem]
  pause: []
  useAsTarget: [MusicClipItem]
  chainEdit: [MusicClipItem, MusicEditMode]
  chainProcess: [MusicClipItem, MusicProcessMode]
  download: [MusicClipItem]
  copyClipId: [string]
  deleteJob: [MusicClipItem]
  exportWav: [MusicClipItem]
  exportMp4: [MusicClipItem]
  exportTiming: [MusicClipItem]
  exportMidi: [MusicClipItem]
  exportVox: [MusicClipItem]
  concatClip: [MusicClipItem]
  openWizard: [MusicClipItem]
  openLyrics: [MusicClipItem]
  closeLyrics: []
  openStem: [MusicClipItem]
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
const volume = ref(0.7)

const {
  barHeights,
  isActive: visualizerActive,
  start: startVisualizer,
  stop: stopVisualizer,
} = useMusicAudioAnalyser(audioRef)

provide(MUSIC_AUDIO_KEY, {
  audioRef,
  currentTime,
  duration,
  isPlaying,
  playingClipId: toRef(props, 'playingClipId'),
})

const listClips = computed(() => listClipsWithoutStemChildren(props.clips))

const activeClip = computed(() =>
  props.clips.find(c => c.clipId === props.activeClipId || c.id === props.activeClipId)
)

const playingClip = computed(() => props.clips.find(c => c.clipId === props.playingClipId))

const playableClips = computed(() => props.clips.filter(c => isClipPlayable(c) && !c.parentClipId))

function stemCountFor(clip: MusicClipItem) {
  return getStemsForSource(props.clips, clip.clipId).length
}

const statusLabel = (s: SunoTaskStatus) => {
  const map: Record<SunoTaskStatus, string> = {
    submitted: 'music.statusSubmitted',
    queued: 'music.statusQueued',
    streaming: 'music.statusStreaming',
    complete: 'music.statusComplete',
    error: 'music.statusError',
  }
  return t(map[s])
}

const statusDotClass = (s: SunoTaskStatus) => {
  if (s === 'complete') return 'music-status-dot music-status-dot--complete'
  if (s === 'error') return 'music-status-dot music-status-dot--error'
  if (s === 'streaming') return 'music-status-dot music-status-dot--streaming'
  return 'music-status-dot music-status-dot--pending'
}

function syncTimeFromAudio() {
  const el = audioRef.value
  if (!el) return
  currentTime.value = el.currentTime
  if (el.duration && Number.isFinite(el.duration)) duration.value = el.duration
  isPlaying.value = !el.paused
}

watch(isPlaying, playing => {
  if (playing) startVisualizer()
  else stopVisualizer()
})

watch(
  volume,
  v => {
    const el = audioRef.value
    if (el) el.volume = Math.min(1, Math.max(0, v))
  },
  { immediate: true }
)

watch(
  () => props.playingClipId,
  async (id, prevId) => {
    const el = audioRef.value
    if (!el) return
    if (!id) {
      el.pause()
      stopVisualizer()
      isPlaying.value = false
      return
    }
    const clip = props.clips.find(c => c.clipId === id)
    if (!clip?.audioUrl) return
    if (el.src !== clip.audioUrl) el.src = clip.audioUrl
    if (id !== prevId || el.paused) {
      try {
        await el.play()
      } catch {
        /* 需用户再次点击（浏览器自动播放策略） */
      }
    }
  }
)

const progressPct = computed(() => {
  const d = duration.value
  if (!d || !Number.isFinite(d)) return 0
  return Math.min(100, (currentTime.value / d) * 100)
})

function onSeekInput(e: Event) {
  const el = audioRef.value
  const d = duration.value
  if (!el || !d) return
  const v = Number((e.target as HTMLInputElement).value)
  el.currentTime = (v / 100) * d
}

function onVolumeInput(e: Event) {
  volume.value = Number((e.target as HTMLInputElement).value) / 100
}

function playAdjacent(delta: -1 | 1) {
  const list = playableClips.value
  if (!list.length) return
  const currentId = props.playingClipId ?? props.activeClipId
  let idx = list.findIndex(c => c.clipId === currentId)
  if (idx < 0) idx = 0
  else idx = (idx + delta + list.length) % list.length
  emit('play', list[idx]!)
}

function playPrev() {
  playAdjacent(-1)
}

function playNext() {
  playAdjacent(1)
}

function togglePlay(clip: MusicClipItem) {
  if (!isClipPlayable(clip)) return
  const el = audioRef.value
  if (props.playingClipId === clip.clipId && el) {
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
    return
  }
  emit('play', clip)
}

function onFooterToggle() {
  if (playingClip.value) togglePlay(playingClip.value)
  else {
    const clip = activeClip.value
    if (clip && isClipPlayable(clip)) emit('play', clip)
  }
}

function onOpenLyricsFromPlayer() {
  if (playingClip.value) emit('openLyrics', playingClip.value)
}

function isActionBusy(kind: MusicDetailActionKind) {
  return props.detailActionBusy === kind
}

function isActionLocked(kind: MusicDetailActionKind) {
  return Boolean(props.detailActionBusy && props.detailActionBusy !== kind)
}

function actionBtnClass(kind: MusicDetailActionKind, extra?: string) {
  return [
    extra,
    {
      'music-action-btn--busy': isActionBusy(kind),
      'music-action-btn--locked': isActionLocked(kind),
    },
  ]
}

const editActions = MUSIC_DETAIL_EDIT_ACTIONS
const processActions = MUSIC_DETAIL_PROCESS_ACTIONS

function isEditActionBlocked(clip: MusicClipItem, mode: MusicEditMode): boolean {
  return mode === 'persona_sing' && !canUsePersonaSing(clip)
}

function openDetail(clip: MusicClipItem) {
  emit('select', clip)
  emit('openDetail', clip)
}

function onEditAction(clip: MusicClipItem, mode: MusicEditMode) {
  if (isEditActionBlocked(clip, mode)) {
    message.warning(t('music.limitPersonaUploadClip'))
    return
  }
  emit('chainEdit', clip, mode)
}

function detailActionTip(
  kind: MusicDetailActionKind,
  clip?: MusicClipItem | null,
  override?: string
): string | undefined {
  if (override?.trim()) return override.trim()
  const key = resolveDetailActionTooltipKey(kind, clip, {
    stemCount: clip ? stemCountFor(clip) : 0,
  })
  if (!key) return undefined
  if (key === 'music.actionTipStemView' && clip) {
    return t(key, { n: stemCountFor(clip) })
  }
  return t(key)
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-[var(--music-surface-page)]">
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--music-border-subtle)] px-5 py-4"
    >
      <div>
        <h2 class="text-base font-semibold tracking-tight text-[var(--text-primary)]">
          {{ t('music.jobsTitle') }}
        </h2>
        <p class="mt-0.5 max-w-md text-xs leading-relaxed text-[var(--text-muted)]">
          {{ t('music.jobsHint') }}
        </p>
      </div>
      <span v-if="listClips.length" class="music-badge shrink-0">
        <MusicIcon name="disc" :size="14" />
        {{ listClips.length }} {{ t('music.tracksCount') }}
      </span>
    </header>

    <div
      class="music-work-scroll custom-scrollbar relative z-[1] min-h-0 flex-1 overflow-y-auto music-empty-glow"
    >
      <div v-if="jobsHydrating && listClips.length === 0" class="music-empty-hero" role="status">
        <span class="music-page-loading__orb" aria-hidden="true" />
        <h3 class="text-lg font-semibold text-[var(--text-primary)]">
          {{ t('music.jobsLoading') }}
        </h3>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
          {{ t('music.jobsLoadingHint') }}
        </p>
      </div>

      <div v-else-if="listClips.length === 0" class="music-empty-hero">
        <div class="music-empty-icon music-text-accent" aria-hidden="true">
          <MusicIcon name="waveform" :size="44" :stroke-width="1.75" />
        </div>
        <h3 class="text-lg font-semibold text-[var(--text-primary)]">
          {{ t('music.emptyTitle') }}
        </h3>
        <p class="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
          {{ t('music.emptyDesc') }}
        </p>
        <ol class="music-empty-steps">
          <li>
            <span class="music-empty-step-num" aria-hidden="true">1</span>
            <span>{{ t('music.emptyStep1') }}</span>
          </li>
          <li>
            <span class="music-empty-step-num" aria-hidden="true">2</span>
            <span>{{ t('music.emptyStep2') }}</span>
          </li>
          <li>
            <span class="music-empty-step-num" aria-hidden="true">3</span>
            <span>{{ t('music.emptyStep3') }}</span>
          </li>
        </ol>
      </div>

      <ul v-else class="flex flex-col gap-2 p-4 md:p-5">
        <li
          v-for="clip in listClips"
          :key="clip.id"
          tabindex="0"
          class="music-job-card group"
          :class="{ 'is-active': activeClipId === clip.clipId }"
          @click="openDetail(clip)"
          @keydown.enter="openDetail(clip)"
        >
          <div
            class="music-card-art relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl"
          >
            <img
              v-if="clip.imageUrl"
              :src="clip.imageUrl"
              :alt="clip.title"
              class="h-full w-full object-cover"
            />
            <MusicIcon v-else name="disc" :size="32" class="opacity-40" />
            <button
              v-if="isClipPlayable(clip)"
              type="button"
              class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
              :aria-label="playingClipId === clip.clipId ? t('music.pause') : t('music.play')"
              @click.stop="togglePlay(clip)"
            >
              <span
                class="music-card-play flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-lg"
              >
                <MusicIcon
                  :name="playingClipId === clip.clipId ? 'pause' : 'play'"
                  :size="18"
                  :stroke-width="2.5"
                />
              </span>
            </button>
          </div>

          <div class="min-w-0 flex-1 py-0.5">
            <div class="flex items-start justify-between gap-2">
              <h3 class="truncate text-sm font-medium text-[var(--text-primary)]">
                {{ clip.title || clip.clipId.slice(0, 8) }}
              </h3>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="music-clip-detail-trigger opacity-70 transition-opacity hover:opacity-100"
                  :aria-label="t('music.clipDetailTitle')"
                  @click.stop="openDetail(clip)"
                >
                  <MusicIcon name="layers" :size="14" />
                </button>
                <span class="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span :class="statusDotClass(displayStatusForClip(clip))" />
                  {{ statusLabel(displayStatusForClip(clip)) }}
                </span>
              </div>
            </div>
            <p v-if="clip.sceneLabel" class="music-text-accent mt-0.5 truncate text-xs">
              {{ clip.sceneLabel }}
            </p>
            <p
              class="mt-1 truncate font-mono text-[10px] text-[var(--text-muted)]"
              :title="clip.clipId"
            >
              {{ clip.clipId }}
            </p>
            <div class="mt-2 flex flex-wrap gap-1 opacity-90">
              <button
                v-if="isClipPlayable(clip)"
                type="button"
                class="music-action-btn music-action-btn--fuchsia"
                @click.stop="emit('openStem', clip)"
              >
                {{
                  stemCountFor(clip) > 0
                    ? t('music.stemViewBtn', { n: stemCountFor(clip) })
                    : t('music.stemModalTitle')
                }}
              </button>
              <button
                v-if="isClipPlayable(clip)"
                type="button"
                class="music-action-btn music-action-btn--violet"
                @click.stop="emit('openLyrics', clip)"
              >
                {{ t('music.lyricsPlayerBtn') }}
              </button>
              <button
                type="button"
                class="music-action-btn"
                @click.stop="emit('useAsTarget', clip)"
              >
                {{ t('music.useAsTarget') }}
              </button>
              <button
                type="button"
                class="music-action-btn"
                @click.stop="emit('copyClipId', clip.clipId)"
              >
                {{ t('music.copyClipId') }}
              </button>
              <button
                type="button"
                class="music-action-btn music-action-btn--danger"
                @click.stop="emit('deleteJob', clip)"
              >
                {{ t('music.deleteJob') }}
              </button>
              <button
                v-if="isClipPlayable(clip)"
                type="button"
                class="music-action-btn"
                @click.stop="emit('download', clip)"
              >
                {{ t('music.download') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="music-work-footer shrink-0">
      <div
        v-if="activeClip && isClipPlayable(activeClip)"
        class="music-detail-actions border-t border-[var(--music-border-subtle)] bg-[var(--music-surface-toolbar)]/95 px-4 py-3 backdrop-blur-md"
      >
        <p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {{ t('music.detailActions') }}
          <span class="ml-2 normal-case tracking-normal text-[var(--text-secondary)]">
            — {{ activeClip.title || activeClip.clipId.slice(0, 8) }}
          </span>
        </p>
        <div class="mb-2 flex flex-wrap gap-1.5">
          <MusicActionTooltipWrap :tip="detailActionTip('stem', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon music-action-btn--fuchsia"
              :class="actionBtnClass('stem')"
              :disabled="isActionLocked('stem')"
              @click.stop="emit('openStem', activeClip)"
            >
              <span v-if="isActionBusy('stem')" class="music-spin music-action-btn__spin" />
              <MusicIcon v-else name="stems" :size="14" class="music-action-btn__icon" />
              {{
                stemCountFor(activeClip) > 0
                  ? t('music.stemViewBtn', { n: stemCountFor(activeClip) })
                  : t('music.stemModalTitle')
              }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('lyrics', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon music-action-btn--violet"
              :class="actionBtnClass('lyrics')"
              :disabled="isActionLocked('lyrics')"
              @click.stop="emit('openLyrics', activeClip)"
            >
              <span v-if="isActionBusy('lyrics')" class="music-spin music-action-btn__spin" />
              <MusicIcon v-else name="lyrics" :size="14" class="music-action-btn__icon" />
              {{ t('music.lyricsPlayerBtn') }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('wav', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="actionBtnClass('wav')"
              :disabled="isActionLocked('wav')"
              @click.stop="emit('exportWav', activeClip)"
            >
              <span v-if="isActionBusy('wav')" class="music-spin music-action-btn__spin" />
              <MusicIcon v-else name="download" :size="14" class="music-action-btn__icon" />
              {{ isActionBusy('wav') ? t('music.exportWavPolling') : t('music.actionWav') }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('mp4', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="actionBtnClass('mp4')"
              :disabled="isActionLocked('mp4')"
              @click.stop="emit('exportMp4', activeClip)"
            >
              <span v-if="isActionBusy('mp4')" class="music-spin music-action-btn__spin" />
              <MusicIcon v-else name="film" :size="14" class="music-action-btn__icon" />
              {{ isActionBusy('mp4') ? t('music.exportMp4Polling') : t('music.actionMp4') }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('timing', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="actionBtnClass('timing')"
              :disabled="isActionLocked('timing')"
              @click.stop="emit('exportTiming', activeClip)"
            >
              <span v-if="isActionBusy('timing')" class="music-spin music-action-btn__spin" />
              <MusicIcon v-else name="clock" :size="14" class="music-action-btn__icon" />
              {{
                isActionBusy('timing') ? t('music.exportTimingPolling') : t('music.actionTiming')
              }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('midi', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="actionBtnClass('midi')"
              :disabled="isActionLocked('midi')"
              @click.stop="emit('exportMidi', activeClip)"
            >
              <span v-if="isActionBusy('midi')" class="music-spin music-action-btn__spin" />
              <MusicIcon v-else name="piano" :size="14" class="music-action-btn__icon" />
              {{
                isActionBusy('midi')
                  ? t('music.midiLoading')
                  : activeClip?.midiState === 'complete'
                    ? t('music.actionMidiView')
                    : t('music.actionMidi')
              }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('vox', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="actionBtnClass('vox')"
              :disabled="isActionLocked('vox')"
              @click.stop="emit('exportVox', activeClip)"
            >
              <MusicIcon name="mic" :size="14" class="music-action-btn__icon" />
              {{ t('music.actionVox') }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('concat', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="actionBtnClass('concat')"
              :disabled="isActionLocked('concat')"
              @click.stop="emit('concatClip', activeClip)"
            >
              <MusicIcon name="link" :size="14" class="music-action-btn__icon" />
              {{ t('music.actionConcat') }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap :tip="detailActionTip('wizard', activeClip)">
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon music-action-btn--violet"
              :class="actionBtnClass('wizard')"
              :disabled="isActionLocked('wizard')"
              @click.stop="emit('openWizard', activeClip)"
            >
              <MusicIcon name="wand" :size="14" class="music-action-btn__icon" />
              {{ t('music.wizardOpenShort') }}
            </button>
          </MusicActionTooltipWrap>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <MusicActionTooltipWrap
            v-for="a in editActions"
            :key="a.mode"
            :tip="
              detailActionTip(
                `edit:${a.mode}`,
                activeClip,
                activeClip && isEditActionBlocked(activeClip, a.mode)
                  ? t('music.limitPersonaUploadClip')
                  : undefined
              )
            "
          >
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon"
              :class="[
                actionBtnClass(`edit:${a.mode}`),
                {
                  'music-action-btn--disabled':
                    activeClip && isEditActionBlocked(activeClip, a.mode),
                },
              ]"
              :disabled="activeClip && isEditActionBlocked(activeClip, a.mode)"
              @click.stop="activeClip && onEditAction(activeClip, a.mode)"
            >
              <MusicIcon
                :name="MUSIC_EDIT_ICON[a.mode] ?? 'extend'"
                :size="14"
                class="music-action-btn__icon"
              />
              {{ t(a.labelKey) }}
            </button>
          </MusicActionTooltipWrap>
          <MusicActionTooltipWrap
            v-for="a in processActions"
            :key="a.mode"
            :tip="detailActionTip(`process:${a.mode}`, activeClip)"
          >
            <button
              type="button"
              class="music-action-btn music-action-btn--lg music-action-btn--with-icon music-action-btn--fuchsia"
              :class="actionBtnClass(`process:${a.mode}`)"
              :disabled="isActionLocked(`process:${a.mode}`)"
              @click.stop="emit('chainProcess', activeClip, a.mode)"
            >
              <span
                v-if="
                  isActionBusy(`process:${a.mode}`) || (a.mode === 'midi' && isActionBusy('midi'))
                "
                class="music-spin music-action-btn__spin"
              />
              <MusicIcon
                v-else
                :name="MUSIC_PROCESS_ICON[a.mode] ?? 'layers'"
                :size="14"
                class="music-action-btn__icon"
              />
              {{ t(a.labelKey) }}
            </button>
          </MusicActionTooltipWrap>
        </div>
      </div>

      <MusicBottomPlayer
        :clip="playingClip"
        :playing="!!playingClipId"
        :is-playing="isPlaying"
        :current-time="currentTime"
        :duration="duration"
        :progress-pct="progressPct"
        :volume="volume"
        :bar-heights="barHeights"
        :visualizer-active="visualizerActive && isPlaying"
        :has-playable="!!playingClip && isClipPlayable(playingClip)"
        @toggle="onFooterToggle"
        @prev="playPrev"
        @next="playNext"
        @seek="onSeekInput"
        @volume-input="onVolumeInput"
        @open-lyrics="onOpenLyricsFromPlayer"
      />
    </div>

    <audio
      ref="audioRef"
      class="hidden"
      @ended="emit('pause')"
      @timeupdate="syncTimeFromAudio"
      @play="syncTimeFromAudio"
      @pause="syncTimeFromAudio"
      @loadedmetadata="syncTimeFromAudio"
    />

    <MusicLyricsPlayerModal
      :visible="!!lyricsPlayerVisible"
      :clip="lyricsPlayerClip ?? null"
      :timing-data="lyricsTimingData"
      :timing-loading="lyricsTimingLoading"
      @close="emit('closeLyrics')"
    />
  </section>
</template>
