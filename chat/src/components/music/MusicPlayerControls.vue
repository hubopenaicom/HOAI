<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'

withDefaults(
  defineProps<{
    playing?: boolean
    disabled?: boolean
    /** 仅主播放键（歌词弹窗等） */
    compact?: boolean
  }>(),
  { compact: false }
)

const emit = defineEmits<{
  toggle: []
  prev: []
  next: []
}>()
</script>

<template>
  <div class="music-player-controls flex items-center justify-center gap-3 sm:gap-4">
    <button
      v-if="!compact"
      type="button"
      class="music-transport-btn"
      :disabled="disabled"
      aria-label="previous"
      @click="emit('prev')"
    >
      <MusicIcon name="skip-back" :size="16" />
    </button>

    <button
      type="button"
      class="music-play-btn"
      :class="{ 'is-playing': playing }"
      :disabled="disabled"
      :aria-label="playing ? 'pause' : 'play'"
      @click="emit('toggle')"
    >
      <MusicIcon
        :name="playing ? 'pause' : 'play'"
        :size="22"
        :stroke-width="playing ? 2.5 : 2"
        class="music-play-btn-play-icon"
      />
    </button>

    <button
      v-if="!compact"
      type="button"
      class="music-transport-btn"
      :disabled="disabled"
      aria-label="next"
      @click="emit('next')"
    >
      <MusicIcon name="skip-forward" :size="16" />
    </button>
  </div>
</template>
