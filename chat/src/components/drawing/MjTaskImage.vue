<script setup lang="ts">
import { t } from '@/locales'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
    /** 任务卡片内避免 lazy 导致完成态仍长时间空白 */
    eager?: boolean
  }>(),
  { eager: true }
)

const loaded = ref(false)
const broken = ref(false)
const sharpMs = ref<number | null>(null)
const startedAt = ref(0)
const tickMs = ref(0)
let tick: ReturnType<typeof setInterval> | null = null

function clearTick() {
  if (tick) {
    clearInterval(tick)
    tick = null
  }
}

function reset() {
  clearTick()
  loaded.value = false
  broken.value = false
  sharpMs.value = null
  startedAt.value = Date.now()
  tickMs.value = 0
  tick = setInterval(() => {
    tickMs.value = Date.now() - startedAt.value
  }, 250)
}

watch(() => props.src, reset, { immediate: true })

onBeforeUnmount(clearTick)

function onImgLoad() {
  clearTick()
  sharpMs.value = Date.now() - startedAt.value
  loaded.value = true
}

function onImgError() {
  clearTick()
  broken.value = true
  loaded.value = true
}

const showStallHint = computed(() => !loaded.value && !broken.value && tickMs.value > 12000)

const loadHint = computed(() =>
  broken.value ? t('drawing.mjImageLoadFailed') : t('drawing.mjImageDecodeLoading')
)

const tickLabel = computed(() => {
  const v = tickMs.value
  return `${Math.round(v / 100) / 10}s`
})

const showSharpBadge = computed(
  () => loaded.value && !broken.value && sharpMs.value != null && sharpMs.value >= 120
)
</script>

<template>
  <div class="relative w-full overflow-hidden bg-slate-950/40">
    <div
      v-if="!loaded || broken"
      class="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-1 bg-slate-950/92 px-2 text-center"
    >
      <span v-if="!broken" class="loading loading-spinner loading-md text-sky-400" />
      <span class="text-[11px] leading-snug text-slate-300">{{ loadHint }}</span>
      <span v-if="!broken" class="font-mono text-[10px] text-slate-500 tabular-nums">{{
        tickLabel
      }}</span>
      <p
        v-if="showStallHint"
        class="pointer-events-auto max-w-[240px] text-[10px] leading-snug text-slate-500"
      >
        {{ t('drawing.mjImageStallHint') }}
      </p>
      <a
        v-if="broken || showStallHint"
        :href="src"
        target="_blank"
        rel="noopener noreferrer"
        class="pointer-events-auto text-[10px] text-sky-400 underline"
        @click.stop
      >
        {{ t('drawing.mjOpenImageNewTab') }}
      </a>
    </div>
    <img
      :src="src"
      class="relative z-0 block h-auto w-full object-contain align-bottom transition-opacity duration-200"
      :class="loaded && !broken ? 'opacity-100' : 'opacity-0'"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      fetchpriority="high"
      alt=""
      @load="onImgLoad"
      @error="onImgError"
    />
    <div
      v-if="showSharpBadge"
      class="pointer-events-none absolute bottom-1 left-1 z-[2] rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-slate-200/95"
    >
      {{ t('drawing.mjImageSharpReadyMs', { ms: sharpMs }) }}
    </div>
  </div>
</template>
