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
  mjTranslateKnownDrawingError,
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
/** 多边形：鼠标在画布上的显示坐标（用于橡皮筋预览） */
const polyHoverDisp = ref<{ x: number; y: number } | null>(null)
/** 多边形：光标距首点足够近，下一次按下将闭合（至少 3 顶点） */
const polyNearFirst = ref(false)

/** 吸附首点闭合的半径（显示坐标 px，随 DPR 无关） */
const POLY_SNAP_CLOSE_PX = 14
/** 与上一顶点过近则忽略本次加点，减轻连点误触 */
const POLY_MIN_EDGE_PX = 4

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

function offsetInImg(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
  const img = imgEl.value
  if (!img) return null
  const r = img.getBoundingClientRect()
  return clampDisp(e.clientX - r.left, e.clientY - r.top)
}

function distDisp(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function updatePolyHoverFromEvent(e: { clientX: number; clientY: number }) {
  if (tool.value !== 'polygon' || polyDraft.value.length === 0) {
    polyHoverDisp.value = null
    polyNearFirst.value = false
    return
  }
  const o = offsetInImg(e)
  if (!o) {
    polyHoverDisp.value = null
    polyNearFirst.value = false
    return
  }
  polyHoverDisp.value = o
  const p0 = polyDraft.value[0]
  polyNearFirst.value =
    polyDraft.value.length >= 3 && distDisp(o, p0) <= POLY_SNAP_CLOSE_PX
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
    const pts = polyDraft.value
    const last = pts[pts.length - 1]
    const hover = polyHoverDisp.value

    ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()

    // 橡皮筋：最后一顶 → 光标
    if (hover) {
      ctx.save()
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = polyNearFirst.value
        ? 'rgba(52, 211, 153, 0.95)'
        : 'rgba(148, 163, 184, 0.75)'
      ctx.lineWidth = polyNearFirst.value ? 2.5 : 1.5
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(hover.x, hover.y)
      if (polyNearFirst.value && pts.length >= 2) {
        ctx.lineTo(pts[0].x, pts[0].y)
      }
      ctx.stroke()
      ctx.restore()
    }

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const isFirst = i === 0
      const r = isFirst && pts.length >= 2 ? (polyNearFirst.value ? 8 : 6) : 4.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      if (isFirst && pts.length >= 2) {
        ctx.fillStyle = polyNearFirst.value ? 'rgba(52, 211, 153, 0.95)' : 'rgba(16, 185, 129, 0.88)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = polyNearFirst.value ? 2 : 1.5
        ctx.stroke()
        if (polyNearFirst.value) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      } else {
        ctx.fillStyle = 'rgba(125, 211, 252, 0.95)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
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

function onVaryRegionGlobalKeydown(ev: KeyboardEvent) {
  if (!props.open || props.variant === 'custom-zoom') return
  const el = ev.target
  if (el instanceof HTMLElement) {
    if (el.closest('textarea, input, select, [contenteditable="true"]')) return
  }
  if (tool.value !== 'polygon') return
  if (ev.key === 'Enter') {
    ev.preventDefault()
    closePolygon()
  } else if (ev.key === 'Backspace') {
    ev.preventDefault()
    undoLastPolyVertex()
  }
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
      polyHoverDisp.value = null
      polyNearFirst.value = false
      dragCur.value = null
      dragging = false
      tool.value = 'rect'
      window.addEventListener('resize', onWinResize)
      window.addEventListener('keydown', onVaryRegionGlobalKeydown)
      void loadImage()
    } else {
      window.removeEventListener('resize', onWinResize)
      window.removeEventListener('keydown', onVaryRegionGlobalKeydown)
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
  window.removeEventListener('keydown', onVaryRegionGlobalKeydown)
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
})

watch(tool, () => {
  committed.value = null
  polyDraft.value = []
  polyHoverDisp.value = null
  polyNearFirst.value = false
  dragCur.value = null
  dragging = false
  redrawOverlay()
})

function tryPolygonSnapClose(o: { x: number; y: number }): boolean {
  if (polyDraft.value.length < 3) return false
  if (distDisp(o, polyDraft.value[0]) > POLY_SNAP_CLOSE_PX) return false
  commitClosedPolygon()
  return true
}

function commitClosedPolygon() {
  if (polyDraft.value.length < 3) {
    ms.warning(t('drawing.mjVaryRegionPolygonNeedThree'))
    return
  }
  committed.value = { kind: 'polygon', pts: [...polyDraft.value] }
  polyDraft.value = []
  polyHoverDisp.value = null
  polyNearFirst.value = false
  redrawOverlay()
}

function closePolygon() {
  commitClosedPolygon()
}

function undoLastPolyVertex() {
  if (polyDraft.value.length === 0) return
  polyDraft.value = polyDraft.value.slice(0, -1)
  redrawOverlay()
}

function onPointerDown(e: PointerEvent) {
  if (tool.value === 'polygon') {
    if (e.button !== 0) return
    const o = offsetInImg(e)
    if (!o) return
    if (tryPolygonSnapClose(o)) return
    const pts = polyDraft.value
    if (pts.length > 0 && distDisp(o, pts[pts.length - 1]) < POLY_MIN_EDGE_PX) return
    polyDraft.value = [...pts, o]
    polyHoverDisp.value = { ...o }
    redrawOverlay()
    return
  }
  const o = offsetInImg(e)
  if (!o) return
  dragging = true
  dragStart = { ...o }
  dragCur.value = { x: o.x, y: o.y, w: 0, h: 0 }
}

function onPointerMove(e: PointerEvent) {
  if (tool.value === 'polygon') {
    updatePolyHoverFromEvent(e)
    redrawOverlay()
  }
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

function onCanvasLeave() {
  polyHoverDisp.value = null
  polyNearFirst.value = false
  onPointerUp()
  redrawOverlay()
}

function onCanvasContextMenu(e: MouseEvent) {
  if (tool.value !== 'polygon' || polyDraft.value.length === 0) return
  e.preventDefault()
  undoLastPolyVertex()
}

function clearSelection() {
  committed.value = null
  polyDraft.value = []
  polyHoverDisp.value = null
  polyNearFirst.value = false
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
      ms.error(mjTranslateKnownDrawingError(parsed.message, t) || t('common.wrong'))
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
      const hintStr = hint != null && String(hint).trim() ? String(hint).trim() : ''
      ms.error(
        hintStr
          ? mjTranslateKnownDrawingError(hintStr, t) || hintStr
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
              <div
                v-if="!isCustomZoom && tool === 'polygon'"
                class="mj-vr-poly-hint mb-2 rounded-xl border border-slate-600/55 bg-slate-950/55 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div
                  class="mj-vr-poly-hint__inner text-left text-[11px] leading-relaxed text-slate-300"
                  v-html="t('drawing.mjVaryRegionHintPolyHtml')"
                />
              </div>
              <p v-else-if="!isCustomZoom" class="mb-2 text-center text-[10px] text-slate-500">
                {{ t('drawing.mjVaryRegionHintDrag') }}
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
                    :class="
                      tool === 'polygon'
                        ? polyNearFirst
                          ? 'cursor-pointer'
                          : 'cursor-crosshair'
                        : 'cursor-crosshair'
                    "
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @pointerleave="onCanvasLeave"
                    @contextmenu.prevent="onCanvasContextMenu"
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

              <div
                v-if="!isCustomZoom && tool === 'polygon'"
                class="mt-3 flex flex-wrap items-center justify-center gap-3"
                role="group"
                :aria-label="t('drawing.mjVaryRegionPolyActionsAria')"
              >
                <button
                  type="button"
                  class="mj-vr-poly-btn mj-vr-poly-btn--secondary"
                  :disabled="polyDraft.length === 0"
                  @click="undoLastPolyVertex"
                >
                  <span class="mj-vr-poly-btn__icon" aria-hidden="true">↩</span>
                  <span class="mj-vr-poly-btn__label">{{ t('drawing.mjVaryRegionPolyUndoLast') }}</span>
                </button>
                <button
                  type="button"
                  class="mj-vr-poly-btn mj-vr-poly-btn--primary"
                  :disabled="polyDraft.length < 3"
                  @click="closePolygon"
                >
                  <span class="mj-vr-poly-btn__icon" aria-hidden="true">✓</span>
                  <span class="mj-vr-poly-btn__label">{{ t('drawing.mjVaryRegionClosePolygon') }}</span>
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

.mj-vr-poly-hint :deep(.mj-vr-hint-txt) {
  color: rgb(148 163 184);
}

/* 多边形说明（v-html 内标签无 scoped data 属性，用 :deep 命中） */
.mj-vr-poly-hint :deep(.mj-vr-hint-chip) {
  display: inline-flex;
  align-items: center;
  margin: 0 0.12em;
  vertical-align: middle;
  border-radius: 0.35rem;
  padding: 0.1em 0.45em 0.12em;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.35;
  border-width: 1px;
  border-style: solid;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.mj-vr-poly-hint :deep(.mj-vr-hint-chip--sky) {
  color: #e0f2fe;
  border-color: rgba(56, 189, 248, 0.55);
  background: linear-gradient(180deg, rgba(14, 116, 144, 0.55), rgba(8, 47, 73, 0.85));
}
.mj-vr-poly-hint :deep(.mj-vr-hint-chip--amber) {
  color: #fffbeb;
  border-color: rgba(251, 191, 36, 0.55);
  background: linear-gradient(180deg, rgba(180, 83, 9, 0.55), rgba(69, 26, 3, 0.88));
}
.mj-vr-poly-hint :deep(.mj-vr-hint-chip--emerald) {
  color: #ecfdf5;
  border-color: rgba(52, 211, 153, 0.6);
  background: linear-gradient(180deg, rgba(5, 150, 105, 0.55), rgba(6, 78, 59, 0.9));
}
.mj-vr-poly-hint :deep(.mj-vr-hint-chip--slate) {
  color: #f1f5f9;
  border-color: rgba(148, 163, 184, 0.45);
  background: linear-gradient(180deg, rgba(51, 65, 85, 0.75), rgba(15, 23, 42, 0.92));
}
.mj-vr-poly-hint :deep(.mj-vr-hint-chip--kbd) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  color: #e2e8f0;
  border-color: rgba(100, 116, 139, 0.55);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.4);
}
.mj-vr-poly-hint :deep(.mj-vr-hint-chip--rose) {
  color: #ffe4e6;
  border-color: rgba(251, 113, 133, 0.55);
  background: linear-gradient(180deg, rgba(190, 18, 60, 0.55), rgba(76, 5, 25, 0.9));
}

/* 多边形操作：明显可点击的实体按钮（不依赖 daisy btn 变体） */
.mj-vr-poly-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.5rem;
  padding: 0.45rem 1.1rem;
  border-radius: 0.75rem;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  border-width: 2px;
  border-style: solid;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.15s ease,
    filter 0.15s ease,
    border-color 0.15s ease;
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.35),
    0 6px 16px rgba(0, 0, 0, 0.28);
}
.mj-vr-poly-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.99);
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.35),
    0 3px 10px rgba(0, 0, 0, 0.22);
}
.mj-vr-poly-btn:disabled {
  cursor: not-allowed;
  opacity: 0.38;
  filter: grayscale(0.25);
  box-shadow: none;
}
.mj-vr-poly-btn__icon {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.35rem;
  font-size: 13px;
  line-height: 1;
  opacity: 0.95;
}
.mj-vr-poly-btn--secondary {
  color: #f1f5f9;
  border-color: rgba(100, 116, 139, 0.75);
  background: linear-gradient(180deg, #475569 0%, #1e293b 55%, #0f172a 100%);
}
.mj-vr-poly-btn--secondary:not(:disabled):hover {
  border-color: rgba(148, 163, 184, 0.95);
  filter: brightness(1.08);
}
.mj-vr-poly-btn--secondary .mj-vr-poly-btn__icon {
  background: rgba(15, 23, 42, 0.45);
  color: #bae6fd;
}
.mj-vr-poly-btn--primary {
  color: #ecfdf5;
  border-color: rgba(52, 211, 153, 0.75);
  background: linear-gradient(180deg, #059669 0%, #047857 45%, #064e3b 100%);
  box-shadow:
    0 2px 0 rgba(6, 78, 59, 0.65),
    0 0 0 1px rgba(167, 243, 208, 0.12),
    0 6px 20px rgba(16, 185, 129, 0.25);
}
.mj-vr-poly-btn--primary:not(:disabled):hover {
  border-color: rgba(110, 231, 183, 0.95);
  filter: brightness(1.07);
}
.mj-vr-poly-btn--primary .mj-vr-poly-btn__icon {
  background: rgba(6, 78, 59, 0.45);
  color: #a7f3d0;
}
.mj-vr-poly-btn:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.65);
  outline-offset: 2px;
}
</style>
