<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import { computed, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    subtitle?: string
    ariaLabel?: string
    maxWidth?: 'md' | 'lg' | 'xl' | '2xl'
  }>(),
  { maxWidth: 'lg' }
)

const emit = defineEmits<{ close: [] }>()

const maxWidthClass = computed(() => {
  const map = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }
  return map[props.maxWidth]
})

watch(
  () => props.visible,
  open => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
  },
  { immediate: true }
)

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

function onBackdropClick() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="music-modal-fade">
      <div
        v-if="visible"
        class="music-modal-overlay music-studio fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel || title"
        @click.self="onBackdropClick"
      >
        <div
          class="music-modal-panel flex max-h-[min(90vh,720px)] w-full flex-col overflow-hidden"
          :class="maxWidthClass"
          @click.stop
        >
          <header
            v-if="title || $slots.header"
            class="music-modal-header flex shrink-0 items-start justify-between gap-3"
          >
            <slot name="header">
              <div class="min-w-0">
                <h3 v-if="title" class="music-modal-title">{{ title }}</h3>
                <p v-if="subtitle" class="music-modal-subtitle">{{ subtitle }}</p>
              </div>
            </slot>
            <button
              type="button"
              class="music-modal-close"
              aria-label="Close"
              @click="emit('close')"
            >
              <MusicIcon name="close" :size="16" />
            </button>
          </header>

          <div class="music-modal-body custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            <slot />
          </div>

          <footer
            v-if="$slots.footer"
            class="music-modal-footer flex shrink-0 flex-wrap items-center justify-end gap-2"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
