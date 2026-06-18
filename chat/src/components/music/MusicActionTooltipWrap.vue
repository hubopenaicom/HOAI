<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'

const props = withDefaults(
  defineProps<{
    tip?: string
    placement?: 'top' | 'bottom'
    /** 包裹块级全宽按钮（侧栏底部操作区） */
    block?: boolean
  }>(),
  { placement: 'top', block: false }
)

const { isMobile } = useBasicLayout()
const wrapRef = useTemplateRef<HTMLElement>('wrapRef')
const visible = ref(false)
const coords = ref({ top: 0, left: 0 })

const canShow = computed(() => Boolean(props.tip?.trim()) && !isMobile.value)

let showTimer: ReturnType<typeof setTimeout> | null = null

function clearShowTimer() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

function updatePosition() {
  const el = wrapRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 10
  coords.value = {
    left: rect.left + rect.width / 2,
    top: props.placement === 'bottom' ? rect.bottom + gap : rect.top - gap,
  }
}

function showTooltip() {
  if (!canShow.value) return
  updatePosition()
  visible.value = true
}

function hideTooltip() {
  clearShowTimer()
  visible.value = false
}

function onPointerEnter() {
  if (!canShow.value) return
  clearShowTimer()
  showTimer = setTimeout(showTooltip, 500)
}

function onPointerLeave() {
  hideTooltip()
}

function onScrollOrResize() {
  if (!visible.value) return
  hideTooltip()
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onUnmounted(() => {
  clearShowTimer()
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <span
    ref="wrapRef"
    class="music-action-tooltip-wrap relative max-w-full"
    :class="block ? 'flex w-full' : 'inline-flex'"
    :title="isMobile ? tip : undefined"
    @mouseenter="onPointerEnter"
    @mouseleave="onPointerLeave"
    @focusin="onPointerEnter"
    @focusout="onPointerLeave"
  >
    <slot />
  </span>

  <Teleport to="body">
    <Transition name="music-action-tooltip-fade">
      <div
        v-if="visible && tip"
        class="music-action-tooltip-portal music-studio"
        :class="placement === 'bottom' ? 'is-bottom' : 'is-top'"
        :style="{ top: `${coords.top}px`, left: `${coords.left}px` }"
        role="tooltip"
      >
        {{ tip }}
      </div>
    </Transition>
  </Teleport>
</template>
