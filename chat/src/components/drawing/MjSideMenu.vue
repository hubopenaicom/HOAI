<script setup lang="ts">
import { t } from '@/locales'

export type MjSpeedMode = 'fast' | 'turbo' | 'relax'
export type MjToolId = 'imagine' | 'blend' | 'describe' | 'shorten'

defineProps<{
  mjMode: MjSpeedMode
  activeTool: MjToolId
}>()

const emit = defineEmits<{
  'update:mjMode': [MjSpeedMode]
  'update:activeTool': [MjToolId]
}>()

const modes: { id: MjSpeedMode; labelKey: string }[] = [
  { id: 'fast', labelKey: 'drawing.mjModeFast' },
  { id: 'turbo', labelKey: 'drawing.mjModeTurbo' },
  { id: 'relax', labelKey: 'drawing.mjModeRelax' },
]

const tools: { id: MjToolId; labelKey: string; icon: string }[] = [
  { id: 'imagine', labelKey: 'drawing.mjToolImagine', icon: '✦' },
  { id: 'blend', labelKey: 'drawing.mjToolBlend', icon: '◇' },
  { id: 'describe', labelKey: 'drawing.mjToolDescribe', icon: '◎' },
  { id: 'shorten', labelKey: 'drawing.mjToolShorten', icon: '≈' },
]
</script>

<template>
  <aside
    class="flex w-full shrink-0 flex-col gap-4 border-b border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40 md:h-auto md:w-56 md:border-b-0 md:border-r"
  >
    <div>
      <p
        class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        {{ t('drawing.mjSpeedTitle') }}
      </p>
      <div class="flex flex-wrap gap-2 md:flex-col">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="btn btn-xs shrink-0 md:btn-sm"
          :class="
            mjMode === m.id
              ? 'btn-primary'
              : 'btn-ghost border border-gray-300 dark:border-gray-600'
          "
          @click="emit('update:mjMode', m.id)"
        >
          {{ t(m.labelKey) }}
        </button>
      </div>
    </div>

    <div>
      <p
        class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        {{ t('drawing.mjToolsTitle') }}
      </p>
      <nav class="flex flex-col gap-1">
        <button
          v-for="tool in tools"
          :key="tool.id"
          type="button"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
          :class="
            activeTool === tool.id
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800'
          "
          @click="emit('update:activeTool', tool.id)"
        >
          <span class="w-5 text-center opacity-80">{{ tool.icon }}</span>
          {{ t(tool.labelKey) }}
        </button>
      </nav>
    </div>

    <p class="mt-auto hidden text-[11px] leading-snug text-gray-400 dark:text-gray-500 md:block">
      {{ t('drawing.mjSideHint') }}
    </p>
  </aside>
</template>
