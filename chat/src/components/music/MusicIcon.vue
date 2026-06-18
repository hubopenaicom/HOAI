<script setup lang="ts">
import { MUSIC_ICONS, type MusicIconName } from '@/constants/musicIcons'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: MusicIconName
    size?: number | string
    strokeWidth?: number
    title?: string
  }>(),
  {
    size: 20,
    strokeWidth: 2,
  }
)

const def = computed(() => MUSIC_ICONS[props.name])
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="title ? undefined : true"
    :aria-label="title"
    :role="title ? 'img' : undefined"
  >
    <path v-for="(d, i) in def.paths" :key="'p-' + i" :d="d" />
    <circle v-for="(c, i) in def.circles" :key="'c-' + i" :cx="c.cx" :cy="c.cy" :r="c.r" />
    <line v-for="(l, i) in def.lines" :key="'l-' + i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
    <polyline v-for="(pts, i) in def.polylines" :key="'pl-' + i" :points="pts" />
  </svg>
</template>
