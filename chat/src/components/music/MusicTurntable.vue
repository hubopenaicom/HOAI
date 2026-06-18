<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    imageUrl?: string
    playing?: boolean
    size?: number
    /** 底部栏嵌入：不显示悬停播放叠层 */
    embed?: boolean
  }>(),
  { embed: false }
)

const emit = defineEmits<{ toggle: [] }>()

const px = computed(() => props.size ?? 112)
const tonearmGradId = `tonearm-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <button
    type="button"
    class="music-turntable music-focus-brand group relative shrink-0 overflow-visible border-0 bg-transparent p-0 focus:outline-none"
    :class="{ 'is-playing': playing }"
    :style="{ width: `${px}px`, height: `${px}px` }"
    :aria-label="playing ? 'pause' : 'play'"
    @click="emit('toggle')"
  >
    <!-- 呼吸光晕层（外 → 内，播放时更明显） -->
    <span
      class="music-turntable-breathe music-turntable-breathe--outer pointer-events-none absolute -inset-[14px] rounded-full"
      aria-hidden="true"
    />
    <span
      class="music-turntable-breathe music-turntable-breathe--mid pointer-events-none absolute -inset-[8px] rounded-full"
      aria-hidden="true"
    />
    <span
      class="music-turntable-halo music-turntable-breathe music-turntable-breathe--inner pointer-events-none absolute -inset-[5px] rounded-full"
      aria-hidden="true"
    />

    <!-- 固定底盘：外圈白边 + 黑胶槽，不旋转 -->
    <span
      class="music-turntable-platter pointer-events-none absolute inset-0 rounded-full bg-[#08080c] shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_8px_28px_rgba(0,0,0,0.55)]"
    >
      <span
        class="music-turntable-platter-glow pointer-events-none absolute inset-0 rounded-full"
        aria-hidden="true"
      />
      <span
        class="absolute inset-[3px] rounded-full bg-gradient-to-br from-zinc-800/90 via-[#0c0a12] to-black ring-1 ring-white/10"
      />

      <!-- 仅内盘旋转 -->
      <span
        class="music-turntable-rotor absolute inset-[8%] rounded-full"
        :class="{ 'is-playing': playing }"
      >
        <span
          class="music-turntable-grooves music-turntable-grooves-shimmer absolute inset-0 rounded-full"
        />
        <span
          class="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,#1e1a28_0%,#050508_68%)]"
        />
        <img
          v-if="imageUrl"
          :src="imageUrl"
          alt=""
          class="pointer-events-none absolute left-1/2 top-1/2 z-[1] aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover shadow-[0_2px_12px_rgba(0,0,0,0.45)] ring-1 ring-black/50"
        />
        <span
          v-else
          class="music-art-gradient pointer-events-none absolute left-1/2 top-1/2 z-[1] flex aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        >
          <MusicIcon name="music" :size="22" />
        </span>
        <span
          class="music-turntable-hub pointer-events-none absolute left-1/2 top-1/2 z-[2] h-[20%] w-[20%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-zinc-900 to-black ring-2 ring-zinc-600/90 shadow-inner"
        />
      </span>

      <!-- 边缘指示点（固定，随呼吸微亮） -->
      <span
        class="music-turntable-edge-dot absolute bottom-[7%] right-[19%] z-[4] h-1.5 w-1.5 rounded-full bg-white/55 shadow-[0_0_8px_rgba(255,255,255,0.75)]"
        aria-hidden="true"
      />
    </span>

    <!-- 唱针臂：固定于底盘，不随碟片转 -->
    <svg
      class="music-tonearm pointer-events-none absolute -right-[4%] -top-[6%] z-30 h-[54%] w-[54%]"
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="tonearmGradId" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4b5563" />
          <stop offset="100%" stop-color="#1f2937" />
        </linearGradient>
      </defs>
      <circle cx="88" cy="22" r="8" fill="#14141c" stroke="#52525b" stroke-width="1.5" />
      <circle cx="88" cy="22" r="3.5" fill="#71717a" />
      <path
        d="M88 22 L42 58"
        :stroke="`url(#${tonearmGradId})`"
        stroke-width="5"
        stroke-linecap="round"
      />
      <path d="M88 22 L42 58" stroke="#27272a" stroke-width="2.5" stroke-linecap="round" />
      <g transform="translate(34 54) rotate(-28)">
        <rect
          x="0"
          y="0"
          width="20"
          height="11"
          rx="2.5"
          fill="#0f172a"
          stroke="#3b82f6"
          stroke-width="1.5"
        />
        <rect x="3" y="2.5" width="14" height="6" rx="1.5" fill="#1e3a8a" />
        <circle cx="10" cy="13" r="2" fill="#60a5fa" />
      </g>
    </svg>

    <span
      v-if="!embed"
      class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-full bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
      :class="{ '!opacity-0': playing }"
    >
      <span
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[var(--music-brand)] shadow-lg"
      >
        <MusicIcon name="play" :size="18" class="translate-x-0.5" />
      </span>
    </span>
  </button>
</template>
