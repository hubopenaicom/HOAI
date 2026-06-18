<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    heights: number[]
    active?: boolean
    variant?: 'inline' | 'boxed'
    compact?: boolean
  }>(),
  { variant: 'inline', compact: false }
)

const bars = computed(() => {
  const n = props.heights.length || 20
  return props.heights.length ? props.heights : new Array(n).fill(0.15)
})

const isBoxed = computed(() => props.variant === 'boxed')
</script>

<template>
  <div
    class="music-visualizer flex items-end justify-center gap-[3px]"
    :class="[
      compact
        ? 'h-7 min-w-[72px] px-0.5'
        : isBoxed
          ? 'h-10 min-w-[120px] px-1'
          : 'h-10 justify-end px-1',
      { 'is-active': active },
    ]"
    aria-hidden="true"
  >
    <span
      v-for="(h, i) in bars"
      :key="i"
      class="music-visualizer-bar w-[3px] rounded-full"
      :class="isBoxed ? 'music-visualizer-bar--boxed' : 'music-visualizer-bar--inline'"
      :style="{
        height: `${Math.round((compact ? 4 : 6) + h * (compact ? 22 : isBoxed ? 32 : 28))}px`,
        transitionDelay: `${(i % 5) * 0.04}s`,
      }"
    />
  </div>
</template>
