<script setup lang="ts">
/**
 * Midjourney 二次编辑弹窗：Vary Region（蒙版 + modal）或 Custom Zoom（仅 prompt / --zoom，无蒙版）。
 * 上游均为 POST /mj/submit/modal；前置 POST /mj/submit/action 由绘画页 beginVaryRegionFlow 完成。
 */
import { submitMjModal } from '@/api/drawingMj'
import type { MjSpeedMode } from '@/api/drawingMj'
import { fetchMjProxyImageBlob } from '@/api/drawingMj'
import { t } from '@/locales'
import { message } from '@/utils/message'
import {
  extractMjTaskId,
  isMjSubmitAcceptedCode,
  normalizeMjSubmitCode,
  parseMjSubmitBody,
} from '@/utils/mjApiParse'
import { stripMjModalPromptModelVersionFlags } from '@/utils/mjFollowUpUi'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  taskId: string
  imageUrl: string
  modelKey: string
  mjMode: MjSpeedMode
  /** 无输入时合并进 prompt；若合并后仍为空则 **不传 prompt 字段**（上游沿用原任务，避免 prompt:"" 被判无效） */
  fallbackPrompt?: string
  /** custom-zoom：仅编辑提示词/--zoom 等提交 modal，无需蒙版 */
  variant?: 'vary-region' | 'custom-zoom'
}>()

const isCustomZoom = computed(() => props.variant === 'custom-zoom')

const MJ_ZOOM_MIN = 1
const MJ_ZOOM_MAX = 2
const MJ_ZOOM_STEP = 0.05

const customZoomLevel = ref(1.5)

watch(customZoomLevel, z => {
  if (typeof z !== 'number' || !Number.isFinite(z)) {
    customZoomLevel.value = 1.5
    return
  }
  const clamped = Math.min(MJ_ZOOM_MAX, Math.max(MJ_ZOOM_MIN, z))
  const snapped = Math.round(clamped / MJ_ZOOM_STEP) * MJ_ZOOM_STEP
  const fin = Math.min(MJ_ZOOM_MAX, Math.max(MJ_ZOOM_MIN, snapped))
  if (Math.abs(fin - z) > 1e-5) customZoomLevel.value = fin
})

function parseZoomFromPromptText(s: string): number | null {
  const m = /\s--zoom\s+([\d.]+)/i.exec(` ${s}`)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  return Math.min(MJ_ZOOM_MAX, Math.max(MJ_ZOOM_MIN, n))
}

function stripZoomFromPrompt(s: string): string {
  return s
    .replace(/\s--zoom\s+[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function formatZoomForMj(z: number): string {
  const r = Math.round(z * 100) / 100
  if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r))
  const t = r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return t || String(r)
}

function applyCustomZoomToPrompt(mergedUserAndFallback: string): string {
  const base = stripZoomFromPrompt(mergedUserAndFallback).trim()
  const zoomArg = `--zoom ${formatZoomForMj(customZoomLevel.value)}`
  return base ? `${base} ${zoomArg}` : zoomArg
}

const emit = defineEmits<{
  'update:open': [boolean]
  submitted: [unknown]
}>()

const ms = message()

type Tool = 'rect' | 'ellipse' | 'polygon'

const tool = ref<Tool>('rect')
const promptLocal = ref('')
const blobUrl = ref('')
const imgLoading = ref(false)
const imgLoadErr = ref('')
const imgEl = ref<HTMLImageElement | null>(null)
const cvRef = ref<HTMLCanvasElement | null>(null)

const dispW = ref(0)
const dispH = ref(0)
const natW = ref(0)
const natH = ref(0)

let dragging = false
let dragStart = { x: 0, y: 0 }
const dragCur = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const committed = ref<
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'polygon'; pts: { x: number; y: number }[] }
  | null
>(null)

const polyDraft = ref<{ x: number; y: number }[]>([])

const submitting = ref(false)

const openModel = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

function clampDisp(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(dispW.value, x)),
    y: Math.max(0, Math.min(dispH.value, y)),
  }
}

function offsetInImg(e: MouseEvent): { x: number; y: number } | null {
  const img = imgEl.value
  if (!img) return null
  const r = img.getBoundingClientRect()
  return clampDisp(e.clientX - r.left, e.clientY - r.top)
}

function syncCanvasSize() {
  const img = imgEl.value
  if (!img || !img.naturalWidth) return
  dispW.value = img.clientWidth
  dispH.value = img.clientHeight
  natW.value = img.naturalWidth
  natH.value = img.naturalHeight
  const cv = cvRef.value
  if (cv) {
    cv.width = dispW.value
    cv.height = dispH.value
  }
}

function onImgLoad() {
  void nextTick(() => {
    syncCanvasSize()
    redrawOverlay()
  })
}

function redrawOverlay() {
  const cv = cvRef.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, cv.width, cv.height)

  const fillPreview = () => {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.28)'
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)'
    ctx.lineWidth = 2
  }

  const drawShape = (kind: 'rect' | 'ellipse', x: number, y: number, w: number, h: number) => {
    fillPreview()
    if (kind === 'rect') {
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    } else {
      const cx = x + w / 2
      const cy = y + h / 2
      const rx = Math.abs(w) / 2
      const ry = Math.abs(h) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  if (committed.value) {
    const c = committed.value
    if (c.kind === 'rect' || c.kind === 'ellipse') {
      drawShape(c.kind, c.x, c.y, c.w, c.h)
    } else if (c.kind === 'polygon' && c.pts.length >= 2) {
      fillPreview()
      ctx.beginPath()
      ctx.moveTo(c.pts[0].x, c.pts[0].y)
      for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  if (dragging && dragCur.value && (tool.value === 'rect' || tool.value === 'ellipse')) {
    const d = dragCur.value
    drawShape(tool.value, d.x, d.y, d.w, d.h)
  }

  if (tool.value === 'polygon' && polyDraft.value.length > 0) {
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.95)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(polyDraft.value[0].x, polyDraft.value[0].y)
    for (let i = 1; i < polyDraft.value.length; i++)
      ctx.lineTo(polyDraft.value[i].x, polyDraft.value[i].y)
    ctx.stroke()
    for (const p of polyDraft.value) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(125, 211, 252, 0.95)'
      ctx.fill()
    }
  }
}

async function loadImage() {
  imgLoadErr.value = ''
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = ''
  }
  if (!props.imageUrl || !props.open) return
  imgLoading.value = true
  try {
    const blob = await fetchMjProxyImageBlob(props.imageUrl)
    blobUrl.value = URL.createObjectURL(blob)
  } catch {
    imgLoadErr.value = t('drawing.mjVaryRegionLoadFail')
  } finally {
    imgLoading.value = false
  }
}

function onWinResize() {
  syncCanvasSize()
  redrawOverlay()
}

watch(
  () => props.open,
  v => {
    if (v) {
      promptLocal.value = props.fallbackPrompt?.trim() || ''
      if (props.variant === 'custom-zoom') {
        const fromFb = parseZoomFromPromptText(props.fallbackPrompt?.trim() || '')
        const fromLocal = parseZoomFromPromptText(promptLocal.value)
        customZoomLevel.value = fromFb ?? fromLocal ?? 1.5
      }
      committed.value = null
      polyDraft.value = []
      dragCur.value = null
      dragging = false
      tool.value = 'rect'
      window.addEventListener('resize', onWinResize)
      void loadImage()
    } else {
      window.removeEventListener('resize', onWinResize)
      if (blobUrl.value) {
        URL.revokeObjectURL(blobUrl.value)
        blobUrl.value = ''
      }
    }
  }
)

watch(
  () => props.imageUrl,
  () => {
    if (props.open) void loadImage()
  }
)

watch(
  () => props.fallbackPrompt,
  fb => {
    if (!props.open) return
    const tx = typeof fb === 'string' ? fb.trim() : ''
    if (tx && !promptLocal.value.trim()) promptLocal.value = tx
  }
)

onUnmounted(() => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
})

watch(tool, () => {
  committed.value = null
  polyDraft.value = []
  dragCur.value = null
  dragging = false
  redrawOverlay()
})

function onPointerDown(e: MouseEvent) {
  if (tool.value === 'polygon') return
  const o = offsetInImg(e)
  if (!o) return
  dragging = true
  dragStart = { ...o }
  dragCur.value = { x: o.x, y: o.y, w: 0, h: 0 }
}

function onPointerMove(e: MouseEvent) {
  if (!dragging || tool.value === 'polygon') return
  const o = offsetInImg(e)
  if (!o) return
  dragCur.value = {
    x: Math.min(dragStart.x, o.x),
    y: Math.min(dragStart.y, o.y),
    w: Math.abs(o.x - dragStart.x),
    h: Math.abs(o.y - dragStart.y),
  }
  redrawOverlay()
}

function onPointerUp() {
  if (!dragging || tool.value === 'polygon') return
  dragging = false
  const d = dragCur.value
  dragCur.value = null
  if (!d || d.w < 4 || d.h < 4) {
    redrawOverlay()
    return
  }
  if (tool.value === 'rect') committed.value = { kind: 'rect', ...d }
  else committed.value = { kind: 'ellipse', ...d }
  redrawOverlay()
}

function onCanvasClick(e: MouseEvent) {
  if (tool.value !== 'polygon') return
  const o = offsetInImg(e)
  if (!o) return
  polyDraft.value = [...polyDraft.value, o]
  redrawOverlay()
}

function closePolygon() {
  if (polyDraft.value.length < 3) {
    ms.warning(t('drawing.mjVaryRegionPolygonNeedThree'))
    return
  }
  committed.value = { kind: 'polygon', pts: [...polyDraft.value] }
  polyDraft.value = []
  redrawOverlay()
}

function clearSelection() {
  committed.value = null
  polyDraft.value = []
  dragCur.value = null
  dragging = false
  redrawOverlay()
}

function dispToNatRect(x: number, y: number, w: number, h: number) {
  const nw = natW.value
  const nh = natH.value
  const dw = dispW.value
  const dh = dispH.value
  return {
    x: (x / dw) * nw,
    y: (y / dh) * nh,
    w: (w / dw) * nw,
    h: (h / dh) * nh,
  }
}

function clampNatRect(nw: number, nh: number, r: { x: number; y: number; w: number; h: number }) {
  let x = Math.floor(r.x)
  let y = Math.floor(r.y)
  let w = Math.ceil(Math.abs(r.w))
  let h = Math.ceil(Math.abs(r.h))
  x = Math.max(0, Math.min(Math.max(0, nw - 1), x))
  y = Math.max(0, Math.min(Math.max(0, nh - 1), y))
  w = Math.max(1, Math.min(nw - x, w))
  h = Math.max(1, Math.min(nh - y, h))
  return { x, y, w, h }
}

function dispToNatPt(p: { x: number; y: number }) {
  const nw = natW.value
  const nh = natH.value
  const dw = dispW.value
  const dh = dispH.value
  return { x: (p.x / dw) * nw, y: (p.y / dh) * nh }
}

function binarizeInpaintMaskCanvas(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const w = c.width
  const h = c.height
  if (w < 1 || h < 1) return
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (lum >= 128) {
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
    } else {
      d[i] = 0
      d[i + 1] = 0
      d[i + 2] = 0
    }
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

function mergeVaryRegionModalPrompt(user: string, fallback: string): string {
  const u = user.trim()
  const fb = fallback.trim()
  if (!u) return fb
  if (!fb) return u
  const userHasHan = /[\u4e00-\u9fff]/.test(u)
  const fbHasHan = /[\u4e00-\u9fff]/.test(fb)
  if (userHasHan && !fbHasHan) return `${fb} ${u}`.trim()
  return u
}

function buildMaskDataUrl(): string | null {
  const nw = natW.value
  const nh = natH.value
  if (!nw || !nh || !committed.value) return null

  const c = document.createElement('canvas')
  c.width = nw
  c.height = nh
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, nw, nh)
  ctx.fillStyle = '#ffffff'

  const sh = committed.value
  if (sh.kind === 'rect') {
    const r = clampNatRect(nw, nh, dispToNatRect(sh.x, sh.y, sh.w, sh.h))
    ctx.fillRect(r.x, r.y, r.w, r.h)
  } else if (sh.kind === 'ellipse') {
    const r = clampNatRect(nw, nh, dispToNatRect(sh.x, sh.y, sh.w, sh.h))
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const rx = Math.abs(r.w) / 2
    const ry = Math.abs(r.h) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    const np = sh.pts.map(dispToNatPt).map(p => ({
      x: Math.max(0, Math.min(nw - 1, Math.round(p.x))),
      y: Math.max(0, Math.min(nh - 1, Math.round(p.y))),
    }))
    ctx.moveTo(np[0].x, np[0].y)
    for (let i = 1; i < np.length; i++) ctx.lineTo(np[i].x, np[i].y)
    ctx.closePath()
    ctx.fill()
  }

  binarizeInpaintMaskCanvas(c)
  return c.toDataURL('image/png')
}

async function submitModal() {
  const zoom = isCustomZoom.value
  const mask = zoom ? null : buildMaskDataUrl()
  if (!zoom && !mask) {
    ms.warning(t('drawing.mjVaryRegionNeedSelection'))
    return
  }
  if (!props.modelKey || !props.taskId) return
  submitting.value = true
  try {
    const userP = promptLocal.value.trim()
    const fb = props.fallbackPrompt?.trim() || ''
    let promptOut = (mergeVaryRegionModalPrompt(userP, fb) || fb).trim()
    if (zoom) {
      promptOut = stripMjModalPromptModelVersionFlags(applyCustomZoomToPrompt(promptOut))
    }
    const r = await submitMjModal({
      model: props.modelKey,
      mjMode: props.mjMode,
      taskId: props.taskId,
      ...(promptOut ? { prompt: promptOut } : {}),
      ...(mask ? { maskBase64: mask } : {}),
    })
    const parsed = parseMjSubmitBody(r)
    if (!parsed.ok) {
      ms.error(parsed.message || t('common.wrong'))
      return
    }
    const mj = parsed.mj
    const tid = extractMjTaskId(mj as { result?: string | number; properties?: unknown })
    if (tid) {
      emit('submitted', r)
      openModel.value = false
      return
    }
    if (!isMjSubmitAcceptedCode(mj?.code)) {
      const hint =
        mj?.description ||
        (mj as Record<string, unknown>)?.msg ||
        (mj as Record<string, unknown>)?.message
      ms.error(
        hint != null && String(hint).trim()
          ? String(hint).trim()
          : t('common.wrong') + ` (code=${normalizeMjSubmitCode(mj?.code) ?? '?'})`
      )
      return
    }
    ms.error(String(mj?.description || '').trim() || t('drawing.mjNoTaskId'))
  } catch (e: unknown) {
    ms.error((e as Error)?.message || t('common.wrong'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      :aria-label="isCustomZoom ? t('drawing.mjCustomZoomTitle') : t('drawing.mjVaryRegionTitle')"
      @click.self="openModel = false"
    >
      <div
        class="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-600/80 bg-[#121822] shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-center justify-between border-b border-slate-700/90 px-4 py-3"
        >
          <h2 class="text-sm font-semibold text-slate-100">
            {{ isCustomZoom ? t('drawing.mjCustomZoomTitle') : t('drawing.mjVaryRegionTitle') }}
          </h2>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            :aria-label="t('drawing.mjVaryRegionClose')"
            @click="openModel = false"
          >
            ✕
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p v-if="imgLoadErr" class="py-8 text-center text-sm text-rose-300">
            {{ imgLoadErr }}
          </p>
          <template v-else>
            <div
              v-if="isCustomZoom"
              class="mb-4 rounded-xl border border-sky-900/50 bg-[#151b26]/95 px-3 py-3 shadow-inner"
            >
              <div class="mb-2 flex items-center justify-between gap-2">
                <span class="text-[11px] font-medium text-slate-200">{{
                  t('drawing.mjCustomZoomSliderLabel')
                }}</span>
                <span class="font-mono text-sm tabular-nums text-sky-300"
                  >×{{ formatZoomForMj(customZoomLevel) }}</span
                >
              </div>
              <input
                v-model.number="customZoomLevel"
                type="range"
                :min="MJ_ZOOM_MIN"
                :max="MJ_ZOOM_MAX"
                :step="MJ_ZOOM_STEP"
                class="mj-cz-zoom-range w-full"
                :aria-label="t('drawing.mjCustomZoomSliderLabel')"
              />
              <div class="mt-2 flex justify-between px-0.5 font-mono text-[10px] text-slate-500">
                <span>1×</span>
                <span>1.5×</span>
                <span>2×</span>
              </div>
              <p class="mt-2 text-[10px] leading-snug text-slate-500">
                {{ t('drawing.mjCustomZoomSliderFootnote') }}
              </p>
              <div class="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  class="btn btn-xs border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                  @click="customZoomLevel = 1"
                >
                  {{ t('drawing.mjCustomZoomPreset100') }}
                </button>
                <button
                  type="button"
                  class="btn btn-xs border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                  @click="customZoomLevel = 1.5"
                >
                  {{ t('drawing.mjCustomZoomPreset150') }}
                </button>
                <button
                  type="button"
                  class="btn btn-xs border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                  @click="customZoomLevel = 2"
                >
                  {{ t('drawing.mjCustomZoomPreset200') }}
                </button>
              </div>
            </div>

            <p
              v-if="isCustomZoom"
              class="mb-3 text-center text-[11px] leading-relaxed text-slate-400"
            >
              {{ t('drawing.mjCustomZoomHint') }}
            </p>

            <div
              v-if="imgLoading"
              class="flex min-h-[160px] items-center justify-center gap-2 text-sm text-sky-400"
            >
              <span class="loading loading-spinner loading-md" />
              {{ t('drawing.mjVaryRegionLoadingImage') }}
            </div>

            <template v-else>
              <div
                v-if="!isCustomZoom"
                class="mb-3 flex flex-wrap items-center justify-center gap-2"
              >
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-[11px] font-medium transition"
                  :class="
                    tool === 'rect'
                      ? 'border-sky-500 bg-sky-900/50 text-sky-100'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  "
                  @click="tool = 'rect'"
                >
                  {{ t('drawing.mjVaryRegionToolRect') }}
                </button>
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-[11px] font-medium transition"
                  :class="
                    tool === 'ellipse'
                      ? 'border-sky-500 bg-sky-900/50 text-sky-100'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  "
                  @click="tool = 'ellipse'"
                >
                  {{ t('drawing.mjVaryRegionToolEllipse') }}
                </button>
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-[11px] font-medium transition"
                  :class="
                    tool === 'polygon'
                      ? 'border-sky-500 bg-sky-900/50 text-sky-100'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  "
                  @click="tool = 'polygon'"
                >
                  {{ t('drawing.mjVaryRegionToolPoly') }}
                </button>
              </div>
              <p v-if="!isCustomZoom" class="mb-2 text-center text-[10px] text-slate-500">
                {{
                  tool === 'polygon'
                    ? t('drawing.mjVaryRegionHintPoly')
                    : t('drawing.mjVaryRegionHintDrag')
                }}
              </p>

              <div class="relative flex justify-center overflow-auto rounded-xl bg-black/30 p-2">
                <div class="relative inline-block max-w-full">
                  <img
                    ref="imgEl"
                    :src="blobUrl"
                    alt=""
                    class="block max-h-[min(56vh,480px)] w-auto max-w-full select-none"
                    draggable="false"
                    @load="onImgLoad"
                  />
                  <canvas
                    v-if="!isCustomZoom"
                    ref="cvRef"
                    class="absolute left-0 top-0 touch-none"
                    :class="tool === 'polygon' ? 'cursor-crosshair' : 'cursor-crosshair'"
                    @mousedown="onPointerDown"
                    @mousemove="onPointerMove"
                    @mouseup="onPointerUp"
                    @mouseleave="onPointerUp"
                    @click="onCanvasClick"
                  />
                </div>
              </div>

              <textarea
                v-model="promptLocal"
                :rows="isCustomZoom ? 4 : 2"
                class="textarea textarea-bordered mt-3 w-full resize-none border-slate-600 bg-[#151b26] text-sm text-slate-100 placeholder:text-slate-600"
                :placeholder="
                  isCustomZoom
                    ? t('drawing.mjCustomZoomPromptPlaceholder')
                    : t('drawing.mjVaryRegionPromptPlaceholder')
                "
              />

              <div v-if="!isCustomZoom && tool === 'polygon'" class="mt-2 flex justify-center">
                <button
                  type="button"
                  class="btn btn-outline btn-xs border-slate-600 text-slate-300"
                  @click="closePolygon"
                >
                  {{ t('drawing.mjVaryRegionClosePolygon') }}
                </button>
              </div>
            </template>
          </template>
        </div>

        <footer
          class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-700/90 px-4 py-3"
        >
          <button
            v-if="!isCustomZoom"
            type="button"
            class="btn btn-ghost btn-sm border border-slate-600 text-slate-300"
            :disabled="!committed && polyDraft.length === 0"
            @click="clearSelection"
          >
            {{ t('drawing.mjVaryRegionClear') }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm border-0 bg-sky-600 px-5 hover:bg-sky-500"
            :disabled="submitting || imgLoading || !!imgLoadErr"
            @click="submitModal"
          >
            {{
              submitting
                ? t('drawing.mjVaryRegionSubmitting')
                : isCustomZoom
                  ? t('drawing.mjCustomZoomSubmit')
                  : t('drawing.mjVaryRegionSubmit')
            }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mj-cz-zoom-range {
  -webkit-appearance: none;
  appearance: none;
  height: 10px;
  border-radius: 9999px;
  background: linear-gradient(to right, #1e293b 0%, #334155 50%, #475569 100%);
  outline: none;
}
.mj-cz-zoom-range:focus-visible {
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.45);
  border-radius: 9999px;
}
.mj-cz-zoom-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: grab;
  border: 2px solid #0f172a;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}
.mj-cz-zoom-range:active::-webkit-slider-thumb {
  cursor: grabbing;
}
.mj-cz-zoom-range::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: grab;
  border: 2px solid #0f172a;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}
.mj-cz-zoom-range::-moz-range-track {
  height: 10px;
  border-radius: 9999px;
  background: #334155;
}
</style>
