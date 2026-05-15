<script setup lang="ts">
import { t } from '@/locales'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
    /** 任务卡片内避免 lazy 导致完成态仍长时间空白 */
    eager?: boolean
    /**
     * 在固定高度父容器内完整显示（max-h + max-w + object-contain），
     * 避免极端宽高比时 `w-full h-auto` 被裁成细条或半张图。
     */
    bounded?: boolean
  }>(),
  { eager: true, bounded: false }
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

const rootClass = computed(() =>
  props.bounded
    ? 'relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-[var(--drawing-card-media)]'
    : 'relative w-full overflow-hidden bg-[var(--drawing-card-media)]'
)

const imgClass = computed(() =>
  props.bounded
    ? 'relative z-0 mx-auto block h-auto max-h-full w-auto max-w-full object-contain align-middle transition-opacity duration-200'
    : 'relative z-0 block h-auto w-full object-contain align-bottom transition-opacity duration-200'
)
</script>

<template>
  <div :class="rootClass">
    <div
      v-if="!loaded || broken"
      class="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-1 bg-[var(--drawing-image-overlay)] px-2 text-center"
    >
      <span v-if="!broken" class="loading loading-spinner loading-md text-sky-400" />
      <span class="text-[11px] leading-snug text-[var(--text-secondary)]">{{ loadHint }}</span>
      <span v-if="!broken" class="font-mono text-[10px] text-[var(--text-muted)] tabular-nums">{{
        tickLabel
      }}</span>
      <p
        v-if="showStallHint"
        class="pointer-events-auto max-w-[240px] text-[10px] leading-snug text-[var(--text-muted)]"
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
      :class="[imgClass, loaded && !broken ? 'opacity-100' : 'opacity-0']"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      fetchpriority="high"
      alt=""
      @load="onImgLoad"
      @error="onImgError"
    />
    <div
      v-if="showSharpBadge"
      class="pointer-events-none absolute bottom-1 left-1 z-[2] rounded-md border border-white/20 bg-neutral-950/78 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white shadow-sm [text-shadow:0_1px_1px_rgba(0,0,0,0.65)]"
    >
      {{ t('drawing.mjImageSharpReadyMs', { ms: sharpMs }) }}
    </div>
  </div>
</template>
