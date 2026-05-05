<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '../../utils'

defineOptions({
  name: 'FaPageHeader',
})

const props = defineProps<{
  title?: string
  description?: string
  class?: HTMLAttributes['class']
  mainClass?: HTMLAttributes['class']
  defaultClass?: HTMLAttributes['class']
}>()

const slots = defineSlots<{
  title?: () => VNode
  description?: () => VNode
  default?: () => VNode
}>()
</script>

<template>
  <div :class="cn('hoai-page-header mb-4 flex flex-wrap items-center justify-between gap-4 transition-colors duration-200 sm:gap-5', props.class)">
    <div :class="cn('min-w-0 flex-[1_1_65%]', props.mainClass)">
      <div class="text-xl font-semibold tracking-tight text-foreground md:text-[1.35rem] md:leading-snug">
        <slot name="title">
          {{ title }}
        </slot>
      </div>
      <div class="mt-2 text-sm leading-relaxed text-muted-foreground empty:hidden">
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </div>
    <div v-if="!!slots.default" :class="cn('flex shrink-0 flex-none flex-wrap items-center justify-end gap-2', props.defaultClass)">
      <slot />
    </div>
  </div>
</template>
