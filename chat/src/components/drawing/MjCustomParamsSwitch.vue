<script setup lang="ts">
import { t } from '@/locales'

const props = defineProps<{
  /** 是否仅手写基础 MJ 参数（--ar/--v 等），不自动从侧栏其它区块拼接 */
  enabled: boolean
}>()

const emit = defineEmits<{
  'update:enabled': [boolean]
}>()

function toggle() {
  emit('update:enabled', !props.enabled)
}
</script>

<template>
  <section
    class="rounded-xl border border-violet-500/20 bg-violet-950/15 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-slate-200">{{
            t('drawing.mjCustomParamsTitle')
          }}</span>
          <button
            type="button"
            class="text-[10px] text-slate-500 hover:text-slate-400"
            :title="t('drawing.mjCustomParamsHint')"
          >
            ⓘ
          </button>
        </div>
        <p class="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          {{ t('drawing.mjCustomParamsHintShort') }}
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span
          class="text-[10px] font-medium tabular-nums"
          :class="enabled ? 'text-amber-200' : 'text-slate-500'"
        >
          {{ enabled ? t('drawing.mjCustomParamsSwitchOn') : t('drawing.mjCustomParamsSwitchOff') }}
        </span>
        <button
          type="button"
          role="switch"
          :aria-checked="enabled"
          :aria-label="t('drawing.mjCustomParamsSwitchAria')"
          class="flex h-8 w-14 shrink-0 items-center rounded-full border border-slate-600/80 bg-slate-900/90 px-1 shadow-inner transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          :class="enabled ? 'border-amber-500/55 bg-amber-950/35' : 'border-slate-600/80'"
          @click="toggle"
        >
          <span
            class="h-6 w-6 shrink-0 rounded-full bg-white shadow transition-[margin] duration-200 ease-out"
            :class="enabled ? 'ml-auto' : 'mr-auto'"
          />
        </button>
      </div>
    </div>
  </section>
</template>
