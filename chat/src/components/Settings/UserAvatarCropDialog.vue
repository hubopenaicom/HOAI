<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  imageFile: File | null
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'confirm', file: File): void
}>()

const PREVIEW = 280
const OUTPUT = 512

const objectUrl = ref('')
const imgEl = ref<HTMLImageElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const natural = ref({ w: 0, h: 0 })
const zoom = ref(1)
const imageReady = ref(false)

/** 相对「居中取景」的左上角偏移（源图像像素），用于拖拽平移 */
const panDx = ref(0)
const panDy = ref(0)

const isPanning = ref(false)
let lastPointerX = 0
let lastPointerY = 0

function revokeUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

function getZoomedCropSize(): { nw: number; nh: number; sSize: number } | null {
  const nw = natural.value.w
  const nh = natural.value.h
  if (!nw || !nh) return null
  const z = Math.max(1, Math.min(3, zoom.value))
  const minSide = Math.min(nw, nh)
  const sSize = minSide / z
  return { nw, nh, sSize }
}

/** 将 pan 限制在当前缩放下的合法区间 */
function clampPanOffsets() {
  const g = getZoomedCropSize()
  if (!g) return
  const { nw, nh, sSize } = g
  const idealSx = (nw - sSize) / 2
  const idealSy = (nh - sSize) / 2
  panDx.value = Math.min(Math.max(panDx.value, -idealSx), nw - sSize - idealSx)
  panDy.value = Math.min(Math.max(panDy.value, -idealSy), nh - sSize - idealSy)
}

watch(
  () => [props.open, props.imageFile] as const,
  ([open, file]) => {
    imageReady.value = false
    natural.value = { w: 0, h: 0 }
    zoom.value = 1
    panDx.value = 0
    panDy.value = 0
    isPanning.value = false
    revokeUrl()
    if (open && file) {
      objectUrl.value = URL.createObjectURL(file)
    }
  }
)

onBeforeUnmount(() => {
  revokeUrl()
})

function onImgLoad(ev: Event) {
  const el = ev.target as HTMLImageElement
  natural.value = { w: el.naturalWidth, h: el.naturalHeight }
  imageReady.value = true
  panDx.value = 0
  panDy.value = 0
  nextTick(() => {
    clampPanOffsets()
    renderPreview()
  })
}

watch(zoom, () => {
  if (!imageReady.value) return
  clampPanOffsets()
  renderPreview()
})

function getCropSource() {
  const g = getZoomedCropSize()
  if (!g) return null
  const { nw, nh, sSize } = g
  const idealSx = (nw - sSize) / 2
  const idealSy = (nh - sSize) / 2
  const sx = Math.min(Math.max(idealSx + panDx.value, 0), nw - sSize)
  const sy = Math.min(Math.max(idealSy + panDy.value, 0), nh - sSize)
  return { sx, sy, sSize }
}

function renderPreview() {
  const canvas = previewCanvas.value
  const img = imgEl.value
  const crop = getCropSource()
  if (!canvas || !img || !crop) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = PREVIEW
  canvas.height = PREVIEW
  ctx.clearRect(0, 0, PREVIEW, PREVIEW)
  ctx.drawImage(img, crop.sx, crop.sy, crop.sSize, crop.sSize, 0, 0, PREVIEW, PREVIEW)
}

/** 预览坐标位移 → 源图平移（手指向右拖，画面向右，源矩形向左） */
function applyPanDeltaPreview(dx: number, dy: number) {
  const g = getZoomedCropSize()
  if (!g) return
  const { nw, nh, sSize } = g
  const scale = sSize / PREVIEW
  const idealSx = (nw - sSize) / 2
  const idealSy = (nh - sSize) / 2
  panDx.value -= dx * scale
  panDy.value -= dy * scale
  clampPanOffsets()
  renderPreview()
}

function onLostPointerCapture() {
  isPanning.value = false
}

function onPanPointerDown(e: PointerEvent) {
  if (!imageReady.value) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  isPanning.value = true
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  const el = e.currentTarget as HTMLElement | null
  el?.setPointerCapture?.(e.pointerId)
}

function onPanPointerMove(e: PointerEvent) {
  if (!isPanning.value) return
  const dx = e.clientX - lastPointerX
  const dy = e.clientY - lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  applyPanDeltaPreview(dx, dy)
}

function onPanPointerUp(e: PointerEvent) {
  if (!isPanning.value) return
  isPanning.value = false
  const el = e.currentTarget as HTMLElement | null
  try {
    el?.releasePointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
}

function close() {
  isPanning.value = false
  emit('update:open', false)
}

function buildCroppedFile(): Promise<File | null> {
  return new Promise(resolve => {
    const img = imgEl.value
    const crop = getCropSource()
    if (!img || !crop) {
      resolve(null)
      return
    }
    const c = document.createElement('canvas')
    c.width = OUTPUT
    c.height = OUTPUT
    const ctx = c.getContext('2d')
    if (!ctx) {
      resolve(null)
      return
    }
    ctx.drawImage(img, crop.sx, crop.sy, crop.sSize, crop.sSize, 0, 0, OUTPUT, OUTPUT)
    c.toBlob(
      blob => {
        if (!blob) {
          resolve(null)
          return
        }
        resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92
    )
  })
}

async function handleConfirm() {
  const file = await buildCroppedFile()
  if (file) emit('confirm', file)
  close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[13000] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
      @click.self="close"
    >
      <div
        class="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-600 dark:bg-gray-800"
        @click.stop
      >
        <h2
          id="avatar-crop-title"
          class="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          裁剪头像
        </h2>
        <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
          在圆圈内拖拽可平移取景；滑块用于放大缩小。确认后保存为正方形头像。
        </p>

        <img v-show="false" ref="imgEl" :src="objectUrl || undefined" alt="" @load="onImgLoad" />

        <div class="flex flex-col items-center gap-4">
          <div
            class="relative overflow-hidden rounded-full border-4 border-gray-200 shadow-inner dark:border-gray-600"
            :class="[
              imageReady ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
            ]"
            :style="{ width: `${PREVIEW}px`, height: `${PREVIEW}px`, touchAction: 'none' }"
            @pointerdown="onPanPointerDown"
            @pointermove="onPanPointerMove"
            @pointerup="onPanPointerUp"
            @pointercancel="onPanPointerUp"
            @lostpointercapture="onLostPointerCapture"
          >
            <canvas
              v-show="imageReady"
              ref="previewCanvas"
              class="pointer-events-none block h-full w-full select-none"
              :width="PREVIEW"
              :height="PREVIEW"
            />
            <div
              v-if="!imageReady"
              class="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              :style="{ width: `${PREVIEW}px`, height: `${PREVIEW}px` }"
            >
              加载中…
            </div>
          </div>

          <div class="w-full space-y-1">
            <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>取景范围</span>
              <span>放大 {{ zoom.toFixed(1) }}×</span>
            </div>
            <input
              v-model.number="zoom"
              type="range"
              min="1"
              max="3"
              step="0.05"
              class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-primary-500 disabled:opacity-50 dark:bg-gray-600"
              :disabled="!imageReady"
            />
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn btn-secondary btn-md" @click="close">取消</button>
          <button
            type="button"
            class="btn btn-primary btn-md"
            :disabled="!imageReady"
            @click="handleConfirm"
          >
            确定并上传
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
