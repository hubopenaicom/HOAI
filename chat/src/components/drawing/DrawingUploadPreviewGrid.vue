<script setup lang="ts">
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { t } from '@/locales'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** data:image/...;base64,... 或 https URL */
    urls: string[]
    accent?: 'sky' | 'teal' | 'violet'
    /** 是否显示「清空全部」（多图时） */
    showClearAll?: boolean
  }>(),
  { accent: 'sky', showClearAll: true }
)

const emit = defineEmits<{
  remove: [index: number]
  clear: []
}>()

const ring = computed(() => {
  if (props.accent === 'teal') return 'ring-teal-500/25 border-teal-500/35'
  if (props.accent === 'violet') return 'ring-violet-500/25 border-violet-500/35'
  return 'ring-sky-500/25 border-sky-500/35'
})

function openPreview(url: string, i: number) {
  openImageViewer({
    imageUrl: url,
    fileName: `upload-preview-${i + 1}`,
  })
}
</script>

<template>
  <div v-if="urls.length" class="mt-2 space-y-2">
    <div class="flex flex-wrap gap-2">
      <div
        v-for="(url, i) in urls"
        :key="`u-${i}-${url.length}`"
        class="group relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl border bg-slate-950/80 shadow-inner"
        :class="ring"
      >
        <button
          type="button"
          class="absolute inset-0 z-0 cursor-zoom-in"
          :aria-label="t('drawing.mjUploadPreviewZoom')"
          @click="openPreview(url, i)"
        >
          <img :src="url" alt="" class="h-full w-full object-cover" decoding="async" />
        </button>
        <button
          type="button"
          class="absolute right-0.5 top-0.5 z-[2] flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white shadow-md backdrop-blur-sm transition hover:bg-rose-600/95"
          :aria-label="t('drawing.mjRemoveImageAria')"
          @click.stop="emit('remove', i)"
        >
          ×
        </button>
      </div>
    </div>
    <button
      v-if="showClearAll && urls.length > 1"
      type="button"
      class="text-[10px] font-medium text-slate-500 underline-offset-2 transition hover:text-slate-300 hover:underline"
      @click="emit('clear')"
    >
      {{ t('drawing.mjClearAllImages') }}
    </button>
  </div>
</template>
