<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import MusicModalShell from '@/components/music/MusicModalShell.vue'
import { t } from '@/locales'
import type { MusicClipItem, SunoTaskStatus } from '@/types/music'
import {
  buildMusicClipDetail,
  resolveSunoMvValueKey,
  type MusicClipDetailRow,
  type MusicModelLabelOption,
} from '@/utils/musicClipDetail'
import { SUNO_MV_SELECT_OPTIONS } from '@/types/music'
import { formatMusicDeductPoints } from '@/utils/musicClipBilling'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import { displayStatusForClip, isClipPlayable } from '@/utils/musicClipPlaybackReady'
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  clip: MusicClipItem | null
  allClips: MusicClipItem[]
  musicModels?: MusicModelLabelOption[]
  playingClipId?: string
}>()

const emit = defineEmits<{
  close: []
  play: [MusicClipItem]
  openLyrics: [MusicClipItem]
  download: [MusicClipItem]
  selectSibling: [MusicClipItem]
  openSource: [MusicClipItem]
}>()

const detail = computed(() =>
  props.clip ? buildMusicClipDetail(props.clip, props.allClips, props.musicModels) : null
)

const isPlaying = computed(() => props.clip?.clipId && props.playingClipId === props.clip.clipId)

const statusDotClass = (s: SunoTaskStatus) => {
  if (s === 'complete') return 'music-status-dot music-status-dot--complete'
  if (s === 'error') return 'music-status-dot music-status-dot--error'
  if (s === 'streaming') return 'music-status-dot music-status-dot--streaming'
  return 'music-status-dot music-status-dot--pending'
}

const statusLabelKey = computed(() => {
  const map: Record<SunoTaskStatus, string> = {
    submitted: 'music.statusSubmitted',
    queued: 'music.statusQueued',
    streaming: 'music.statusStreaming',
    complete: 'music.statusComplete',
    error: 'music.statusError',
  }
  return props.clip ? map[displayStatusForClip(props.clip)] : ''
})

function displayRowValue(row: MusicClipDetailRow): string {
  if (row.valueKey) return t(row.valueKey)
  if (row.id === 'deductCharged' && props.clip) {
    const formatted = formatMusicDeductPoints(
      props.clip.deductCharged,
      props.clip.deductTypeSnapshot,
      t
    )
    if (formatted) return formatted
  }
  if (row.id === 'musicModelVersion' && props.clip) {
    const mvKey = resolveSunoMvValueKey(props.clip)
    if (mvKey) {
      const label = t(mvKey)
      if (props.clip.majorModelVersion && !label.includes(props.clip.majorModelVersion)) {
        return `${label} · ${props.clip.majorModelVersion}`
      }
      return label
    }
  }
  return row.value
}

function onCopy(value: string) {
  if (!value || value === '—') return
  copyText({ text: value })
  message.success(t('music.copied'))
}

function onPlay() {
  if (!props.clip || !isClipPlayable(props.clip)) return
  emit('play', props.clip)
}
</script>

<template>
  <MusicModalShell
    :visible="visible"
    :title="clip?.title || t('music.clipDetailTitle')"
    :subtitle="clip?.sceneLabel"
    :aria-label="t('music.clipDetailTitle')"
    max-width="2xl"
    @close="emit('close')"
  >
    <template v-if="clip && detail" #header>
      <div class="music-clip-detail-hero flex min-w-0 flex-1 gap-4">
        <div
          class="music-clip-detail-cover relative flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-[var(--music-border-subtle)]"
        >
          <img
            v-if="clip.imageUrl"
            :src="clip.imageUrl"
            :alt="clip.title"
            class="h-full w-full object-cover"
          />
          <div v-else class="music-art-gradient flex h-full w-full items-center justify-center">
            <MusicIcon name="disc" :size="36" class="opacity-50" />
          </div>
          <button
            v-if="clip && isClipPlayable(clip)"
            type="button"
            class="music-clip-detail-play absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity hover:bg-black/55"
            :aria-label="isPlaying ? t('music.pause') : t('music.play')"
            @click="onPlay"
          >
            <span
              class="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[var(--text-primary)] shadow-lg"
            >
              <MusicIcon :name="isPlaying ? 'pause' : 'play'" :size="20" :stroke-width="2.5" />
            </span>
          </button>
        </div>

        <div class="min-w-0 flex-1 pt-0.5">
          <h3 class="music-modal-title truncate">{{ clip.title || clip.clipId.slice(0, 8) }}</h3>
          <p class="music-text-accent mt-1 truncate text-xs font-medium" :title="clip.sceneLabel">
            {{ clip.sceneLabel }}
          </p>
          <p
            v-if="clip.sunoMv || clip.sunoModelName || clip.majorModelVersion"
            class="mt-1 truncate text-[11px] text-[var(--text-muted)]"
          >
            {{ t('music.detailMusicModelVersion') }}:
            <template v-if="clip.sunoMv">
              {{
                t(
                  SUNO_MV_SELECT_OPTIONS.find(o => o.value === clip.sunoMv)?.labelKey ||
                    'music.mvFenix'
                )
              }}
            </template>
            <template v-else-if="clip.sunoModelName">
              {{ clip.sunoModelName
              }}{{ clip.majorModelVersion ? ` · ${clip.majorModelVersion}` : '' }}
            </template>
            <template v-else>{{ clip.majorModelVersion }}</template>
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span :class="statusDotClass(displayStatusForClip(clip))" />
              {{ t(statusLabelKey) }}
            </span>
            <span v-if="clip.duration && clip.duration > 0" class="music-badge text-[10px]">
              <MusicIcon name="clock" :size="12" />
              {{ Math.floor(clip.duration / 60) }}:{{
                String(Math.floor(clip.duration % 60)).padStart(2, '0')
              }}
            </span>
          </div>
          <p
            class="mt-2 truncate font-mono text-[10px] text-[var(--text-muted)]"
            :title="clip.clipId"
          >
            {{ clip.clipId }}
          </p>
        </div>
      </div>
    </template>

    <div v-if="detail" class="music-clip-detail-grid">
      <section
        v-for="section in detail.sections"
        :key="section.id"
        class="music-clip-detail-section"
        :class="`music-clip-detail-section--${section.id}`"
      >
        <h4 class="music-clip-detail-section__title">
          <MusicIcon
            :name="
              section.id === 'overview'
                ? 'disc'
                : section.id === 'models'
                  ? 'sparkles'
                  : section.id === 'billing'
                    ? 'sparkles'
                    : section.id === 'advanced'
                      ? 'wand'
                      : section.id === 'creative'
                        ? 'lyrics'
                        : section.id === 'technical'
                          ? 'copy'
                          : section.id === 'media'
                            ? 'link'
                            : 'layers'
            "
            :size="14"
            class="music-clip-detail-section__icon"
          />
          {{ t(section.titleKey) }}
        </h4>

        <dl class="music-clip-detail-rows">
          <div
            v-for="row in section.rows"
            :key="row.id"
            class="music-clip-detail-row"
            :class="{ 'music-clip-detail-row--mono': row.mono, 'is-empty': row.empty }"
          >
            <dt>{{ t(row.labelKey) }}</dt>
            <dd>
              <a
                v-if="row.href && !row.empty"
                :href="row.href"
                target="_blank"
                rel="noopener noreferrer"
                class="music-clip-detail-link"
              >
                {{ displayRowValue(row) }}
              </a>
              <span v-else class="music-clip-detail-value">{{ displayRowValue(row) }}</span>
              <button
                v-if="row.copyable && !row.empty"
                type="button"
                class="music-clip-detail-copy"
                :aria-label="t('music.copyClipId')"
                @click="onCopy(row.value)"
              >
                <MusicIcon name="copy" :size="12" />
              </button>
            </dd>
          </div>
        </dl>
      </section>

      <section
        v-if="detail.sourceClip"
        class="music-clip-detail-section music-clip-detail-section--source"
      >
        <h4 class="music-clip-detail-section__title">
          <MusicIcon name="link" :size="14" class="music-clip-detail-section__icon" />
          {{ t('music.detailSourceTrack') }}
        </h4>
        <button
          type="button"
          class="music-clip-detail-source-card"
          @click="emit('openSource', detail.sourceClip!)"
        >
          <img
            v-if="detail.sourceClip.imageUrl"
            :src="detail.sourceClip.imageUrl"
            alt=""
            class="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-[var(--music-border-subtle)]"
          />
          <div
            v-else
            class="music-art-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          >
            <MusicIcon name="disc" :size="22" class="opacity-50" />
          </div>
          <div class="min-w-0 flex-1 text-left">
            <p class="truncate text-sm font-medium text-[var(--text-primary)]">
              {{ detail.sourceClip.title || detail.sourceClip.clipId.slice(0, 8) }}
            </p>
            <p class="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
              {{ detail.sourceClip.clipId }}
            </p>
          </div>
          <MusicIcon name="extend" :size="14" class="shrink-0 text-[var(--music-accent)]" />
        </button>
      </section>

      <section
        v-if="detail.batchSiblings.length"
        class="music-clip-detail-section music-clip-detail-section--siblings"
      >
        <h4 class="music-clip-detail-section__title">
          <MusicIcon name="disc" :size="14" class="music-clip-detail-section__icon" />
          {{ t('music.detailBatchVariants') }}
        </h4>
        <ul class="music-clip-detail-siblings">
          <li>
            <button type="button" class="music-clip-detail-sibling is-current" disabled>
              {{ clip.title || clip.clipId.slice(0, 8) }}
              <span class="music-clip-detail-sibling__tag">{{
                t('music.detailCurrentTrack')
              }}</span>
            </button>
          </li>
          <li v-for="sib in detail.batchSiblings" :key="sib.id">
            <button
              type="button"
              class="music-clip-detail-sibling"
              @click="emit('selectSibling', sib)"
            >
              {{ sib.title || sib.clipId.slice(0, 8) }}
            </button>
          </li>
        </ul>
      </section>

      <details class="music-details music-clip-detail-raw">
        <summary>{{ t('music.detailRawJson') }}</summary>
        <div class="music-details__body">
          <pre class="music-clip-detail-json">{{ detail.rawMetadataJson }}</pre>
          <button
            type="button"
            class="music-btn-secondary music-btn-sm mt-3 inline-flex items-center gap-1.5"
            @click="onCopy(detail.rawMetadataJson)"
          >
            <MusicIcon name="copy" :size="14" />
            {{ t('music.detailCopyJson') }}
          </button>
        </div>
      </details>
    </div>

    <template v-if="clip" #footer>
      <button type="button" class="music-btn-ghost music-btn-sm" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        v-if="clip && isClipPlayable(clip)"
        type="button"
        class="music-btn-secondary music-btn-sm inline-flex items-center gap-1.5"
        @click="emit('openLyrics', clip)"
      >
        <MusicIcon name="lyrics" :size="14" />
        {{ t('music.lyricsPlayerBtn') }}
      </button>
      <button
        v-if="clip && isClipPlayable(clip)"
        type="button"
        class="music-btn-secondary music-btn-sm inline-flex items-center gap-1.5"
        @click="emit('download', clip)"
      >
        <MusicIcon name="download" :size="14" />
        {{ t('music.download') }}
      </button>
      <button
        type="button"
        class="music-btn-primary music-btn-sm inline-flex items-center gap-1.5"
        @click="onCopy(clip.clipId)"
      >
        <MusicIcon name="copy" :size="14" />
        {{ t('music.copyClipId') }}
      </button>
    </template>
  </MusicModalShell>
</template>
