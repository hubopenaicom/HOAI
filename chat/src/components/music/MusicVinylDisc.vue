<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import { computed } from 'vue'

const props = defineProps<{
  imageUrl?: string
  playing?: boolean
  size?: number
}>()

const emit = defineEmits<{ toggle: [] }>()

const px = computed(() => props.size ?? 52)
</script>

<template>
  <button
    type="button"
    class="music-vinyl-disc music-focus-brand group relative shrink-0 rounded-full p-0 focus:outline-none"
    :style="{ width: `${px}px`, height: `${px}px`, minWidth: `${px}px`, minHeight: `${px}px` }"
    :aria-label="playing ? 'pause' : 'play'"
    @click="emit('toggle')"
  >
    <!-- 固定圆形容器，内部仅 rotate，避免 translate 与动画冲突 -->
    <span class="music-vinyl-mask absolute inset-0 overflow-hidden rounded-full">
      <span
        class="music-vinyl-rotor absolute inset-[2px] rounded-full bg-gradient-to-br from-zinc-900 via-[#1a1224] to-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
        :class="{ 'is-playing': playing }"
      >
        <span
          class="pointer-events-none absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0_1px,transparent_1px_3px)]"
        />
        <span
          class="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-950 ring-2 ring-zinc-700/80"
        />
        <img
          v-if="imageUrl"
          :src="imageUrl"
          alt=""
          class="pointer-events-none absolute inset-[18%] z-[1] rounded-full object-cover ring-1 ring-white/10"
        />
        <span
          v-else
          class="music-art-gradient pointer-events-none absolute inset-[18%] z-[1] flex items-center justify-center rounded-full"
        >
          <MusicIcon name="music" :size="14" />
        </span>
      </span>
    </span>

    <!-- 播放按钮叠层，不参与旋转 -->
    <span
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/15 opacity-0 transition-opacity group-hover:opacity-100"
      :class="{ 'opacity-85': playing }"
    >
      <span
        class="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[var(--music-brand)] shadow-md"
      >
        <MusicIcon :name="playing ? 'pause' : 'play'" :size="14" />
      </span>
    </span>
  </button>
</template>
