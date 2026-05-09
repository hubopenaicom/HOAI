<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 px-3 py-6 backdrop-blur-md sm:px-5"
      @click.self="close"
    >
      <div
        class="flex h-[min(92vh,900px)] max-h-[min(92vh,900px)] w-full max-w-[min(96vw,1180px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-600/60 bg-[#0b1018] shadow-[0_28px_90px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
        role="dialog"
        aria-modal="true"
        @click.stop
      >
        <div
          class="relative shrink-0 border-b border-slate-700/80 bg-gradient-to-b from-[#131b28]/98 to-[#0c121c]"
        >
          <button
            type="button"
            class="absolute right-3 top-3 z-[2] rounded-full bg-black/35 p-2 text-white ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-black/55"
            :title="t('drawing.viewerClose')"
            @click="close"
          >
            <Close size="22" />
          </button>

          <div class="max-h-[38vh] overflow-y-auto pr-14 pl-4 pb-4 pt-4 custom-scrollbar">
            <div class="space-y-4">
              <div class="flex gap-3">
                <span
                  class="mt-0.5 w-[4.75rem] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-sky-400/95"
                  >{{ t('drawing.viewerCaptionOriginal') }}</span
                >
                <p
                  class="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-100"
                >
                  {{ captionOriginalDisplay }}
                </p>
                <button
                  type="button"
                  class="viewer-icon-btn mt-0.5 shrink-0"
                  :disabled="!trimOriginal"
                  :title="t('chat.copy')"
                  @click="copyCaption('original')"
                >
                  <Copy size="18" />
                </button>
              </div>

              <div v-if="showTranslatedRow" class="flex gap-3 border-t border-slate-700/60 pt-4">
                <span
                  class="mt-0.5 w-[4.75rem] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-violet-400/95"
                  >{{ t('drawing.viewerCaptionTranslated') }}</span
                >
                <p
                  class="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-200/95"
                >
                  {{ captionTranslatedDisplay }}
                </p>
                <button
                  type="button"
                  class="viewer-icon-btn mt-0.5 shrink-0"
                  :disabled="!trimTranslated"
                  :title="t('chat.copy')"
                  @click="copyCaption('translated')"
                >
                  <Copy size="18" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 bg-[#070b11]/95 px-3 py-2"
        >
          <div class="flex flex-wrap items-center gap-1">
            <button
              class="viewer-toolbar-btn"
              type="button"
              @click="zoomOut"
              :disabled="scale <= minScale"
              :title="t('drawing.viewerZoomOut')"
            >
              <Minus size="20" />
            </button>

            <span class="min-w-[52px] px-1 text-center text-xs text-slate-300">
              {{ Math.round(scale * 100) }}%
            </span>

            <button
              class="viewer-toolbar-btn"
              type="button"
              @click="zoomIn"
              :disabled="scale >= maxScale"
              :title="t('drawing.viewerZoomIn')"
            >
              <Plus size="20" />
            </button>

            <div class="mx-1 h-5 w-px bg-slate-600/80" />

            <button
              class="viewer-toolbar-btn"
              type="button"
              @click="rotateLeft"
              :title="t('drawing.viewerRotateLeft')"
            >
              <span class="text-base">↺</span>
            </button>
            <button
              class="viewer-toolbar-btn"
              type="button"
              @click="rotateRight"
              :title="t('drawing.viewerRotateRight')"
            >
              <span class="text-base">↻</span>
            </button>

            <div class="mx-1 h-5 w-px bg-slate-600/80" />

            <button
              class="viewer-toolbar-btn"
              type="button"
              @click="reset"
              :title="t('drawing.viewerReset')"
            >
              <Refresh size="20" />
            </button>
          </div>

          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-500/55 bg-slate-800/90 px-3 py-2 text-xs font-medium text-slate-100 shadow-sm transition hover:bg-slate-700/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70"
              :title="t('drawing.viewerOpenInNewTabTitle')"
              :disabled="!props.imageUrl"
              @click="openInNewTab"
            >
              <Link size="17" />
              {{ t('drawing.viewerOpenInNewTab') }}
            </button>
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-sky-500/50 bg-sky-600/95 px-3.5 py-2 text-xs font-medium text-white shadow-md transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80"
              @click="save"
            >
              <Download size="17" />
              {{ t('drawing.viewerSaveAs') }}
            </button>
          </div>
        </div>

        <div
          ref="imageContainer"
          class="relative min-h-0 flex-1 basis-0 overflow-hidden bg-gradient-to-b from-slate-950/80 to-black"
          :class="{ 'cursor-grab': !isDragging, 'cursor-grabbing': isDragging }"
          @mousedown="startDrag"
          @mousemove="drag"
          @mouseup="stopDrag"
          @mouseleave="stopDrag"
          @wheel.prevent="handleWheel"
        >
          <!-- 绝对定位避免大图固有尺寸撑破 flex，transform 不再参与布局占位 -->
          <img
            ref="imageRef"
            :src="imageUrl"
            class="pointer-events-auto absolute left-1/2 top-1/2 max-w-none select-none will-change-transform"
            :style="imageStyle"
            :alt="t('drawing.viewerImageAlt')"
            @load="handleImageLoad"
            @error="handleImageError"
            @dragstart.prevent
          />

          <div
            v-if="loading"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35"
          >
            <span class="text-sm text-slate-200">{{ t('drawing.viewerLoading') }}</span>
          </div>

          <div
            v-if="error"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45"
          >
            <span class="text-sm text-rose-300">{{ t('drawing.viewerLoadError') }}</span>
          </div>
        </div>

        <div
          class="shrink-0 border-t border-slate-800/80 bg-black/35 px-4 py-2 text-center text-[11px] text-slate-500"
        >
          {{ t('drawing.viewerShortcutHint') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Close, Copy, Download, Link, Minus, Plus, Refresh } from '@icon-park/vue-next'
import { fetchMjProxyImageBlob } from '@/api/drawingMj'
import { t } from '@/locales'
import { buildDownloadFileName } from '@/utils/imageFileName'
import { message as messageApi } from '@/utils/message'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  visible: boolean
  imageUrl: string
  fileName?: string
  captionOriginal?: string
  captionTranslated?: string
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  fileName: 'image',
  captionOriginal: '',
  captionTranslated: '',
})

const emit = defineEmits<Emits>()

const imageRef = ref<HTMLImageElement>()
const imageContainer = ref<HTMLDivElement>()
const loading = ref(true)
const error = ref(false)

const scale = ref(1)
const rotation = ref(0)
const translateX = ref(0)
const translateY = ref(0)

const minScale = 0.1
const maxScale = 5

const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragOffset = ref({ x: 0, y: 0 })

const originalSize = ref({ width: 0, height: 0 })

const EM_DASH = '—'

const trimOriginal = computed(() => props.captionOriginal?.trim() ?? '')
const trimTranslated = computed(() => props.captionTranslated?.trim() ?? '')

const captionOriginalDisplay = computed(() => trimOriginal.value || EM_DASH)
const captionTranslatedDisplay = computed(() => trimTranslated.value)

const showTranslatedRow = computed(() => {
  const tr = trimTranslated.value
  const or = trimOriginal.value
  return !!tr && tr !== or
})

const imageStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  transformOrigin: 'center center',
}))

function msg() {
  return messageApi()
}

function copyViaFallbackDom(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

async function copyCaption(which: 'original' | 'translated') {
  const text = which === 'original' ? trimOriginal.value : trimTranslated.value
  if (!text) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      msg().success(t('drawing.viewerCopied'))
      return
    }
  } catch {
    /* fallback below */
  }
  if (copyViaFallbackDom(text)) msg().success(t('drawing.viewerCopied'))
  else msg().error(t('drawing.viewerCopyFailed'))
}

async function handleImageLoad() {
  loading.value = false
  error.value = false

  if (imageRef.value) {
    originalSize.value = {
      width: imageRef.value.naturalWidth,
      height: imageRef.value.naturalHeight,
    }

    await nextTick()
    autoFit()
  }
}

function handleImageError() {
  loading.value = false
  error.value = true
}

function autoFit() {
  if (!imageRef.value || !imageContainer.value) return

  const imageWidth = originalSize.value.width
  const imageHeight = originalSize.value.height
  if (!imageWidth || !imageHeight) return

  const containerRect = imageContainer.value.getBoundingClientRect()
  if (containerRect.width < 16 || containerRect.height < 16) return

  const scaleX = (containerRect.width * 0.92) / imageWidth
  const scaleY = (containerRect.height * 0.92) / imageHeight
  const fitScale = Math.min(scaleX, scaleY, 1)

  scale.value = fitScale
}

function zoomIn() {
  scale.value = Math.min(scale.value * 1.2, maxScale)
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.2, minScale)
}

function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
}

function rotateLeft() {
  rotation.value = (rotation.value - 90 + 360) % 360
}

function reset() {
  rotation.value = 0
  translateX.value = 0
  translateY.value = 0
  const iw = originalSize.value.width
  const ih = originalSize.value.height
  if (iw && ih) {
    void nextTick(() => autoFit())
  } else {
    scale.value = 1
  }
}

/** 从已显示的 img 绘制到 canvas（同源或未污染时可导出） */
async function blobFromCanvasImage(img: HTMLImageElement): Promise<Blob | null> {
  if (!img.complete || !img.naturalWidth) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    return await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b && b.size > 0 ? b : null), 'image/png')
    })
  } catch {
    return null
  }
}

function isHttpRemoteImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false
  return true
}

/** 新标签页打开图片地址（等价于用户自行打开链接再右键「图片另存为」）；脚本无法触发系统右键菜单 */
function resolveImageUrlForNewTab(): string {
  const u = props.imageUrl?.trim() ?? ''
  if (!u) return ''
  if (u.startsWith('blob:') || u.startsWith('data:')) return u
  try {
    return new URL(
      u,
      typeof window !== 'undefined' ? window.location.href : 'https://invalid.invalid/'
    ).href
  } catch {
    return u
  }
}

function openInNewTab() {
  const href = resolveImageUrlForNewTab()
  if (!href) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

/**
 * 获取可保存的 Blob：浏览器 fetch → 同源接口代理 → 当前预览图 canvas → 临时 Image+crossOrigin。
 * 禁止用 <a href=远程URL download> 降级：跨域时浏览器会忽略 download 并新开标签页。
 */
async function getImageBlobForSave(): Promise<Blob | null> {
  if (!props.imageUrl) return null

  try {
    const response = await fetch(props.imageUrl, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
    })
    if (response.ok) {
      const blob = await response.blob()
      if (blob.size > 0) return blob
    }
  } catch {
    /* continue */
  }

  if (isHttpRemoteImageUrl(props.imageUrl)) {
    try {
      const blob = await fetchMjProxyImageBlob(props.imageUrl)
      if (blob.size > 0) return blob
    } catch {
      /* continue */
    }
  }

  const shown = imageRef.value
  if (shown) {
    const fromShown = await blobFromCanvasImage(shown)
    if (fromShown) return fromShown
  }

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('img load'))
      img.src = props.imageUrl
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx?.drawImage(img, 0, 0)

    return await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b && b.size > 0 ? b : null), 'image/png')
    })
  } catch {
    return null
  }
}

async function trySaveWithFilePicker(blob: Blob, suggestedName: string): Promise<boolean> {
  const w = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName?: string
      types?: Array<{ description: string; accept: Record<string, string[]> }>
    }) => Promise<FileSystemFileHandle>
  }

  if (typeof w.showSaveFilePicker !== 'function') return false

  try {
    const handle = await w.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'Image',
          accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
          },
        },
      ],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    msg().success(t('drawing.viewerSaveSuccess'))
    return true
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return true
    console.warn('[ImageViewer] showSaveFilePicker failed', e)
    return false
  }
}

function fallbackDownloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

async function save() {
  if (!props.imageUrl) return

  try {
    const blob = await getImageBlobForSave()
    const suggestedName = buildDownloadFileName(props.fileName || 'image', props.imageUrl, blob)

    if (blob && blob.size > 0) {
      if (await trySaveWithFilePicker(blob, suggestedName)) return
      fallbackDownloadBlob(blob, suggestedName)
      return
    }

    try {
      await navigator.clipboard.writeText(props.imageUrl)
      msg().warning(t('drawing.viewerSaveBlockedWithLink'))
    } catch {
      msg().warning(t('drawing.viewerSaveBlockedManual'))
    }
  } catch (e) {
    console.error('[ImageViewer] save failed', e)
    msg().error(t('drawing.viewerSaveFailed'))
  }
}

function handleWheel(event: WheelEvent) {
  event.preventDefault()

  const delta = event.deltaY > 0 ? -1 : 1
  const zoomFactor = 1.1
  const newScale =
    delta > 0
      ? Math.min(scale.value * zoomFactor, maxScale)
      : Math.max(scale.value / zoomFactor, minScale)

  scale.value = newScale
}

function startDrag(event: MouseEvent) {
  if (event.button !== 0) return

  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  dragOffset.value = { x: translateX.value, y: translateY.value }
}

function drag(event: MouseEvent) {
  if (!isDragging.value) return

  const deltaX = event.clientX - dragStart.value.x
  const deltaY = event.clientY - dragStart.value.y

  translateX.value = dragOffset.value.x + deltaX
  translateY.value = dragOffset.value.y + deltaY
}

function stopDrag() {
  isDragging.value = false
}

function close() {
  emit('update:visible', false)
  emit('close')
}

function handleKeyDown(event: KeyboardEvent) {
  if (!props.visible) return

  const { key, ctrlKey, metaKey } = event
  const isCtrl = ctrlKey || metaKey

  switch (key) {
    case 'Escape':
      close()
      break
    case '=':
    case '+':
      if (isCtrl) {
        event.preventDefault()
        zoomIn()
      }
      break
    case '-':
      if (isCtrl) {
        event.preventDefault()
        zoomOut()
      }
      break
    case '0':
      if (isCtrl) {
        event.preventDefault()
        reset()
      }
      break
    case 'ArrowLeft':
      if (isCtrl) {
        event.preventDefault()
        rotateLeft()
      }
      break
    case 'ArrowRight':
      if (isCtrl) {
        event.preventDefault()
        rotateRight()
      }
      break
    case 's':
      if (isCtrl) {
        event.preventDefault()
        void save()
      }
      break
    default:
      break
  }
}

let bodyOverflowBackup = ''

watch(
  () => props.visible,
  newVisible => {
    if (newVisible) {
      loading.value = true
      error.value = false
      reset()
      if (typeof document !== 'undefined') {
        bodyOverflowBackup = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
    } else if (typeof document !== 'undefined') {
      document.body.style.overflow = bodyOverflowBackup
    }
  }
)

watch(
  () => props.imageUrl,
  () => {
    if (props.visible) {
      loading.value = true
      error.value = false
      reset()
    }
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.body.style.overflow = bodyOverflowBackup
})
</script>

<style scoped>
.viewer-icon-btn {
  @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-600/70 bg-slate-800/80 text-slate-200 transition hover:border-sky-500/50 hover:bg-slate-700/90 hover:text-white disabled:cursor-not-allowed disabled:opacity-35;
}

.viewer-toolbar-btn {
  @apply flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40;
}

.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgb(71 85 105 / 0.7) transparent;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgb(71 85 105 / 0.75);
  border-radius: 9999px;
}
</style>
