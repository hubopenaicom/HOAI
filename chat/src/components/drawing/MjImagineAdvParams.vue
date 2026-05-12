<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch, type Ref } from 'vue'
import { t } from '@/locales'
import type { MjSpeedMode } from '@/api/drawingMj'
import { uploadMjRefCdnUrl } from '@/api/drawingMj'
import { fileToMjRefDataUrlForUpload } from '@/utils/mjRefFileToDataUrl'
import { message } from '@/utils/message'
import { copyText } from '@/utils/format'
import {
  mjClipExtRefUrlForStorage,
  mjExtRefUrlLooksUsable,
  mjExtRefUrlSanitized,
} from '@/utils/mjApiParse'
import {
  mjDrawingRefCrefKey,
  mjDrawingRefOrefKey,
  mjDrawingRefSrefKey,
} from '@/utils/mjDrawingInjectKeys'
import {
  mjVersionSupportsCref,
  mjVersionSupportsDraft,
  mjVersionSupportsOref,
  mjVersionSupportsSref,
  mjSvPickerChoices,
} from '@/utils/mjParamVersionSupport'
import { useAuthStore } from '@/store'

const ms = message()
type MjStyle = 'realistic' | 'anime'
type MjRealisticVersion = '6' | '7' | '8'
type MjNijiVersion = '6' | '7'
type MjV8OutputMode = 'off' | 'sd' | 'hd'

const props = withDefaults(
  defineProps<{
    /** 是否显示 --iw（图生图模式） */
    showIw: boolean
    mjStyle: MjStyle
    mjRealisticVersion: MjRealisticVersion
    mjNijiVersion: MjNijiVersion
    iw: number
    stylize: number
    chaos: number
    weird: number
    stop: number
    /** 0 关；1=.25 / 2=.5 / 3=1 / 4=2 */
    quality: number
    styleRaw: boolean
    /** 角色参考图直链，与 --cw 配合 */
    crefUrl: string
    /** 0 不写入 --cw；1～100 写入（需有效 --cref） */
    cw: number
    srefUrl: string
    /** 0 不写入 --sw；与 --sref 配合 */
    sw: number
    /** 0 不写入 --sv；合法档位随主模型变化，与 --sref 配合 */
    sv: number
    orefUrl: string
    /** 0 不写入 --ow；与 --oref 配合 */
    ow: number
    tile: boolean
    draft: boolean
    /** 0/1 不写入；2～40 写入 --repeat */
    repeat: number
    /** 写实 V8：官方 V8.1 文档中的 SD / HD 输出（互斥，默认不附加） */
    v8OutputMode: MjV8OutputMode
    /** 当前选中的 MJ 模型 key，用于上传参考图到上游图床 */
    mjRefUploadModelKey: string
    /** 与提交 Imagine 一致的速度通道 */
    mjRefUploadSpeed: MjSpeedMode
    /** 存在有效 Omni（--oref）链时：与 Draft、最高档 `--q`、Fast/Turbo 官方不兼容，由父级传入 */
    orefOfficialComboLock?: boolean
  }>(),
  {
    mjStyle: 'realistic',
    mjRealisticVersion: '7',
    mjNijiVersion: '6',
    iw: 0,
    stylize: 0,
    chaos: 0,
    weird: 0,
    stop: 0,
    quality: 0,
    styleRaw: false,
    crefUrl: '',
    cw: 0,
    srefUrl: '',
    sw: 0,
    sv: 0,
    orefUrl: '',
    ow: 0,
    tile: false,
    draft: false,
    repeat: 0,
    v8OutputMode: 'off',
    mjRefUploadModelKey: '',
    mjRefUploadSpeed: 'fast',
    orefOfficialComboLock: false,
  }
)

const emit = defineEmits<{
  'update:iw': [number]
  'update:stylize': [number]
  'update:chaos': [number]
  'update:weird': [number]
  'update:stop': [number]
  'update:quality': [number]
  'update:styleRaw': [boolean]
  'update:crefUrl': [string]
  'update:cw': [number]
  'update:srefUrl': [string]
  'update:sw': [number]
  'update:sv': [number]
  'update:orefUrl': [string]
  'update:ow': [number]
  'update:tile': [boolean]
  'update:draft': [boolean]
  'update:repeat': [number]
  'update:v8OutputMode': [MjV8OutputMode]
  /** cref/sref/oref 任一正在上传图床（用于父页拦截「生成」） */
  mjRefUploading: [boolean]
}>()

/** 与绘画页 index 中 mjRefCrefUrl 等为同一 Ref；上传后直接写入，避免仅靠 emit 时父级未同步 */
const crefParentUrl = inject(mjDrawingRefCrefKey, undefined)
const srefParentUrl = inject(mjDrawingRefSrefKey, undefined)
const orefParentUrl = inject(mjDrawingRefOrefKey, undefined)

function commitCrefUrl(raw: string) {
  const s = mjClipExtRefUrlForStorage(String(raw ?? ''))
  /** blob 仅供本组件预览，写入父级会导致校验与展示异常 */
  if (s.startsWith('blob:')) return
  if (crefParentUrl) crefParentUrl.value = s
  emit('update:crefUrl', s)
}
function commitSrefUrl(raw: string) {
  const s = mjClipExtRefUrlForStorage(String(raw ?? ''))
  if (s.startsWith('blob:')) return
  if (srefParentUrl) srefParentUrl.value = s
  emit('update:srefUrl', s)
}
function commitOrefUrl(raw: string) {
  const s = mjClipExtRefUrlForStorage(String(raw ?? ''))
  if (s.startsWith('blob:')) return
  if (orefParentUrl) orefParentUrl.value = s
  emit('update:orefUrl', s)
}

const authStore = useAuthStore()
const crefBusy = ref(false)
const srefBusy = ref(false)
const orefBusy = ref(false)

watch(
  () => crefBusy.value || srefBusy.value || orefBusy.value,
  v => {
    emit('mjRefUploading', v)
  },
  { immediate: true }
)

const crefFileEl = ref<HTMLInputElement | null>(null)
const srefFileEl = ref<HTMLInputElement | null>(null)
const orefFileEl = ref<HTMLInputElement | null>(null)
/** 上传完成前用本地 blob 预览，避免「成功但远程图暂不可显」时误以为没上传 */
const crefLocalPreview = ref('')
const srefLocalPreview = ref('')
const orefLocalPreview = ref('')
/** 与后端 upload-discord-images 解析出的 https 一致；父级未及时同步时由 watch 补发 update */
const crefPendingSync = ref('')
const srefPendingSync = ref('')
const orefPendingSync = ref('')
/** 接口已返回 https，但父级 props 可能尚未刷新时，用于输入框与缩略图兜底（避免仍显示 blob 或空白） */
const crefUploadedHttpsHold = ref('')
const srefUploadedHttpsHold = ref('')
const orefUploadedHttpsHold = ref('')
/** 上传解析出 https 后立刻写入，优先于 props/hold，避免少数浏览器受控 input 不刷新 */
const crefDisplayForce = ref('')
const srefDisplayForce = ref('')
const orefDisplayForce = ref('')

/** 最近一次参考图上传错误（含超时），便于与 toast 对照排查 */
const mjRefCdnLastErr = ref('')
const MJ_REF_CDN_CLIENT_TIMEOUT_MS = 180_000

const crefStuckShow = ref(false)
const srefStuckShow = ref(false)
const orefStuckShow = ref(false)
let crefStuckTimer: ReturnType<typeof setTimeout> | undefined
let srefStuckTimer: ReturnType<typeof setTimeout> | undefined
let orefStuckTimer: ReturnType<typeof setTimeout> | undefined

function withMjRefUploadTimeout<T>(p: Promise<T>, ms = MJ_REF_CDN_CLIENT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`MJ_REF_UPLOAD_TIMEOUT:${ms}`)), ms)
    p.then(
      v => {
        clearTimeout(t)
        resolve(v)
      },
      e => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

function clearUploadedHttpsHold(kind: 'cref' | 'sref' | 'oref') {
  if (kind === 'cref') crefUploadedHttpsHold.value = ''
  else if (kind === 'sref') srefUploadedHttpsHold.value = ''
  else orefUploadedHttpsHold.value = ''
}

watch(
  () => props.crefUrl,
  v => {
    if (mjExtRefUrlLooksUsable(v)) {
      crefUploadedHttpsHold.value = ''
      crefDisplayForce.value = ''
    }
  }
)
watch(
  () => props.srefUrl,
  v => {
    if (mjExtRefUrlLooksUsable(v)) {
      srefUploadedHttpsHold.value = ''
      srefDisplayForce.value = ''
    }
  }
)
watch(
  () => props.orefUrl,
  v => {
    if (mjExtRefUrlLooksUsable(v)) {
      orefUploadedHttpsHold.value = ''
      orefDisplayForce.value = ''
    }
  }
)

function attachRefResync(opts: {
  pending: Ref<string>
  propUrl: () => string
  emitUrl: (u: string) => void
  localPreview: Ref<string>
}) {
  watch(
    () => opts.propUrl(),
    () => {
      if (mjExtRefUrlLooksUsable(opts.propUrl())) opts.pending.value = ''
    }
  )
  watch(
    [opts.pending, () => opts.propUrl()],
    async () => {
      const raw = opts.pending.value
      const u = raw && mjExtRefUrlSanitized(raw)
      if (!u) return
      if (mjExtRefUrlLooksUsable(opts.propUrl())) {
        revokeIfBlob(opts.localPreview.value)
        opts.localPreview.value = ''
        return
      }
      await nextTick()
      await nextTick()
      if (mjExtRefUrlLooksUsable(opts.propUrl())) {
        revokeIfBlob(opts.localPreview.value)
        opts.localPreview.value = ''
        return
      }
      opts.emitUrl(u)
      await nextTick()
      if (mjExtRefUrlLooksUsable(opts.propUrl())) {
        revokeIfBlob(opts.localPreview.value)
        opts.localPreview.value = ''
      } else {
        ms.warning(t('drawing.mjRefCrefSyncWarn'))
      }
    },
    { flush: 'post' }
  )
}

attachRefResync({
  pending: crefPendingSync,
  propUrl: () => props.crefUrl,
  emitUrl: commitCrefUrl,
  localPreview: crefLocalPreview,
})
attachRefResync({
  pending: srefPendingSync,
  propUrl: () => props.srefUrl,
  emitUrl: commitSrefUrl,
  localPreview: srefLocalPreview,
})
attachRefResync({
  pending: orefPendingSync,
  propUrl: () => props.orefUrl,
  emitUrl: commitOrefUrl,
  localPreview: orefLocalPreview,
})

function revokeIfBlob(u: string) {
  if (u && u.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      /* ignore */
    }
  }
}

/** 少数环境下 emit/props 与 inject 同一帧未对齐，多拍 nextTick 重试写入父级 */
async function flushMjRefUrlToParent(kind: 'cref' | 'sref' | 'oref', https: string) {
  const apply = () => {
    if (kind === 'cref') {
      crefUploadedHttpsHold.value = https
      commitCrefUrl(https)
    } else if (kind === 'sref') {
      srefUploadedHttpsHold.value = https
      commitSrefUrl(https)
    } else {
      orefUploadedHttpsHold.value = https
      commitOrefUrl(https)
    }
  }
  apply()
  for (let i = 0; i < 4; i++) {
    await nextTick()
    const ok =
      kind === 'cref'
        ? mjExtRefUrlLooksUsable(props.crefUrl)
        : kind === 'sref'
          ? mjExtRefUrlLooksUsable(props.srefUrl)
          : mjExtRefUrlLooksUsable(props.orefUrl)
    if (ok) return
    apply()
  }
}

async function onRefFileInput(ev: Event, kind: 'cref' | 'sref' | 'oref') {
  const busy = kind === 'cref' ? crefBusy : kind === 'sref' ? srefBusy : orefBusy
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!props.mjRefUploadModelKey.trim()) {
    ms.warning(t('drawing.mjRefUploadNeedModel'))
    return
  }
  if (!authStore.isLogin) {
    ms.warning(t('drawing.mjRefUploadNeedLogin'))
    return
  }

  mjRefCdnLastErr.value = ''

  const localUrl = URL.createObjectURL(file)
  if (kind === 'cref') {
    crefPendingSync.value = ''
    clearUploadedHttpsHold('cref')
    crefDisplayForce.value = ''
    revokeIfBlob(crefLocalPreview.value)
    crefLocalPreview.value = localUrl
  } else if (kind === 'sref') {
    srefPendingSync.value = ''
    clearUploadedHttpsHold('sref')
    srefDisplayForce.value = ''
    revokeIfBlob(srefLocalPreview.value)
    srefLocalPreview.value = localUrl
  } else {
    orefPendingSync.value = ''
    clearUploadedHttpsHold('oref')
    orefDisplayForce.value = ''
    revokeIfBlob(orefLocalPreview.value)
    orefLocalPreview.value = localUrl
  }

  busy.value = true
  try {
    const dataUrl = await withMjRefUploadTimeout(fileToMjRefDataUrlForUpload(file))
    const { url } = await withMjRefUploadTimeout(
      uploadMjRefCdnUrl({
        model: props.mjRefUploadModelKey.trim(),
        mjMode: props.mjRefUploadSpeed,
        base64: dataUrl,
      })
    )
    /** 与写入 prompt 一致：先规范化，避免不可见字符/换行；历史上 type=url 受控框在部分浏览器会显示为空 */
    const https = mjExtRefUrlSanitized(mjClipExtRefUrlForStorage(url))
    if (!https) {
      throw new Error(`NO_URL_IN_RESPONSE:${String(url).slice(0, 200)}`)
    }
    if (kind === 'cref') crefDisplayForce.value = https
    else if (kind === 'sref') srefDisplayForce.value = https
    else orefDisplayForce.value = https
    await flushMjRefUrlToParent(kind, https)
    if (kind === 'cref') {
      revokeIfBlob(crefLocalPreview.value)
      crefLocalPreview.value = ''
    } else if (kind === 'sref') {
      revokeIfBlob(srefLocalPreview.value)
      srefLocalPreview.value = ''
    } else {
      revokeIfBlob(orefLocalPreview.value)
      orefLocalPreview.value = ''
    }
    mjRefCdnLastErr.value = ''
    ms.success(t('drawing.mjRefUploadOk'))
  } catch (e: unknown) {
    let msg =
      (e as { message?: string })?.message ||
      (e as { msg?: string })?.msg ||
      t('drawing.mjRefUploadFail')
    if (typeof msg === 'string' && msg.startsWith('NO_URL_IN_RESPONSE:')) {
      msg = t('drawing.mjRefUploadNoUrl')
    } else if (typeof msg === 'string' && msg.startsWith('MJ_REF_UPLOAD_TIMEOUT:')) {
      msg = t('drawing.mjRefUploadTimeout')
    }
    mjRefCdnLastErr.value = msg
    ms.error(msg)
    if (kind === 'cref') {
      crefPendingSync.value = ''
      clearUploadedHttpsHold('cref')
      crefDisplayForce.value = ''
      revokeIfBlob(crefLocalPreview.value)
      crefLocalPreview.value = ''
    } else if (kind === 'sref') {
      srefPendingSync.value = ''
      clearUploadedHttpsHold('sref')
      srefDisplayForce.value = ''
      revokeIfBlob(srefLocalPreview.value)
      srefLocalPreview.value = ''
    } else {
      orefPendingSync.value = ''
      clearUploadedHttpsHold('oref')
      orefDisplayForce.value = ''
      revokeIfBlob(orefLocalPreview.value)
      orefLocalPreview.value = ''
    }
  } finally {
    busy.value = false
  }
}

function clearRefUrl(kind: 'cref' | 'sref' | 'oref') {
  mjRefCdnLastErr.value = ''
  if (kind === 'cref') {
    crefPendingSync.value = ''
    clearUploadedHttpsHold('cref')
    crefDisplayForce.value = ''
    revokeIfBlob(crefLocalPreview.value)
    crefLocalPreview.value = ''
    commitCrefUrl('')
  } else if (kind === 'sref') {
    srefPendingSync.value = ''
    clearUploadedHttpsHold('sref')
    srefDisplayForce.value = ''
    revokeIfBlob(srefLocalPreview.value)
    srefLocalPreview.value = ''
    commitSrefUrl('')
  } else {
    orefPendingSync.value = ''
    clearUploadedHttpsHold('oref')
    orefDisplayForce.value = ''
    revokeIfBlob(orefLocalPreview.value)
    orefLocalPreview.value = ''
    commitOrefUrl('')
  }
}

const iwDisplay = computed(() => {
  if (props.iw <= 0) return t('drawing.mjParamOff')
  const v = 0.25 + ((props.iw - 1) / 99) * 1.75
  return `--iw ${v.toFixed(2)}`
})

const stylizeDisplay = computed(() =>
  props.stylize <= 0 ? t('drawing.mjParamOff') : `--s ${Math.round(props.stylize)}`
)
const chaosDisplay = computed(() =>
  props.chaos <= 0 ? t('drawing.mjParamOff') : `--chaos ${Math.round(props.chaos)}`
)
const weirdDisplay = computed(() =>
  props.weird <= 0 ? t('drawing.mjParamOff') : `--weird ${Math.round(props.weird)}`
)
const stopDisplay = computed(() =>
  props.stop < 10 ? t('drawing.mjParamOff') : `--stop ${Math.round(props.stop)}`
)

const qualityLabels = ['', '.25', '.5', '1', '2'] as const

function setQuality(n: number) {
  emit('update:quality', n)
}

const showCrefCw = computed(() =>
  mjVersionSupportsCref(props.mjStyle, props.mjRealisticVersion, props.mjNijiVersion)
)

const showSrefSwSv = computed(() =>
  mjVersionSupportsSref(props.mjStyle, props.mjRealisticVersion, props.mjNijiVersion)
)

const svPickerChoices = computed(() =>
  mjSvPickerChoices(props.mjStyle, props.mjRealisticVersion, props.mjNijiVersion)
)

const showOrefOw = computed(() =>
  mjVersionSupportsOref(props.mjStyle, props.mjRealisticVersion, props.mjNijiVersion)
)

/** 草稿 --draft：仅写实 V7（V8.1 上游多不支持 Draft job） */
const showDraft = computed(() =>
  mjVersionSupportsDraft(props.mjStyle, props.mjRealisticVersion, props.mjNijiVersion)
)

const showV8Output = computed(
  () => props.mjStyle === 'realistic' && props.mjRealisticVersion === '8'
)

const crefLooksValid = computed(() => mjExtRefUrlLooksUsable(props.crefUrl))
const srefLooksValid = computed(() => mjExtRefUrlLooksUsable(props.srefUrl))
const orefLooksValid = computed(() => mjExtRefUrlLooksUsable(props.orefUrl))

function mjResolveRefHttpsLine(propUrl: string, hold: string, forced: string): string {
  const f = mjExtRefUrlSanitized(mjClipExtRefUrlForStorage(forced))
  if (f) return mjClipExtRefUrlForStorage(f)
  if (mjExtRefUrlLooksUsable(propUrl)) return mjClipExtRefUrlForStorage(propUrl)
  const h = mjExtRefUrlSanitized(hold)
  return h ? mjClipExtRefUrlForStorage(h) : mjClipExtRefUrlForStorage(String(propUrl ?? ''))
}

const crefHttpsLine = computed(() =>
  mjResolveRefHttpsLine(props.crefUrl, crefUploadedHttpsHold.value, crefDisplayForce.value)
)
const srefHttpsLine = computed(() =>
  mjResolveRefHttpsLine(props.srefUrl, srefUploadedHttpsHold.value, srefDisplayForce.value)
)
const orefHttpsLine = computed(() =>
  mjResolveRefHttpsLine(props.orefUrl, orefUploadedHttpsHold.value, orefDisplayForce.value)
)

function onCrefHttpsInput(ev: Event) {
  crefDisplayForce.value = ''
  clearUploadedHttpsHold('cref')
  commitCrefUrl((ev.target as HTMLInputElement).value)
}
function onSrefHttpsInput(ev: Event) {
  srefDisplayForce.value = ''
  clearUploadedHttpsHold('sref')
  commitSrefUrl((ev.target as HTMLInputElement).value)
}
function onOrefHttpsInput(ev: Event) {
  orefDisplayForce.value = ''
  clearUploadedHttpsHold('oref')
  commitOrefUrl((ev.target as HTMLInputElement).value)
}

watch(
  [crefBusy, crefLocalPreview, crefHttpsLine],
  () => {
    if (crefStuckTimer) clearTimeout(crefStuckTimer)
    crefStuckShow.value = false
    if (!crefBusy.value && crefLocalPreview.value && !crefHttpsLine.value.trim()) {
      crefStuckTimer = setTimeout(() => {
        crefStuckShow.value = true
      }, 4000)
    }
  },
  { flush: 'post' }
)
watch(
  [srefBusy, srefLocalPreview, srefHttpsLine],
  () => {
    if (srefStuckTimer) clearTimeout(srefStuckTimer)
    srefStuckShow.value = false
    if (!srefBusy.value && srefLocalPreview.value && !srefHttpsLine.value.trim()) {
      srefStuckTimer = setTimeout(() => {
        srefStuckShow.value = true
      }, 4000)
    }
  },
  { flush: 'post' }
)
watch(
  [orefBusy, orefLocalPreview, orefHttpsLine],
  () => {
    if (orefStuckTimer) clearTimeout(orefStuckTimer)
    orefStuckShow.value = false
    if (!orefBusy.value && orefLocalPreview.value && !orefHttpsLine.value.trim()) {
      orefStuckTimer = setTimeout(() => {
        orefStuckShow.value = true
      }, 4000)
    }
  },
  { flush: 'post' }
)

onUnmounted(() => {
  if (crefStuckTimer) clearTimeout(crefStuckTimer)
  if (srefStuckTimer) clearTimeout(srefStuckTimer)
  if (orefStuckTimer) clearTimeout(orefStuckTimer)
  revokeIfBlob(crefLocalPreview.value)
  revokeIfBlob(srefLocalPreview.value)
  revokeIfBlob(orefLocalPreview.value)
  crefLocalPreview.value = ''
  srefLocalPreview.value = ''
  orefLocalPreview.value = ''
})

const crefThumbSrc = computed(() => {
  const u = mjExtRefUrlSanitized(props.crefUrl)
  if (u) return u
  const uh = mjExtRefUrlSanitized(crefUploadedHttpsHold.value)
  if (uh) return uh
  const fd = mjExtRefUrlSanitized(crefDisplayForce.value)
  if (fd) return fd
  if (crefLocalPreview.value) return crefLocalPreview.value
  return ''
})
const srefThumbSrc = computed(() => {
  const u = mjExtRefUrlSanitized(props.srefUrl)
  if (u) return u
  const uh = mjExtRefUrlSanitized(srefUploadedHttpsHold.value)
  if (uh) return uh
  const fd = mjExtRefUrlSanitized(srefDisplayForce.value)
  if (fd) return fd
  if (srefLocalPreview.value) return srefLocalPreview.value
  return ''
})
const orefThumbSrc = computed(() => {
  const u = mjExtRefUrlSanitized(props.orefUrl)
  if (u) return u
  const uh = mjExtRefUrlSanitized(orefUploadedHttpsHold.value)
  if (uh) return uh
  const fd = mjExtRefUrlSanitized(orefDisplayForce.value)
  if (fd) return fd
  if (orefLocalPreview.value) return orefLocalPreview.value
  return ''
})

const cwDisplay = computed(() =>
  props.cw <= 0 || !crefLooksValid.value ? t('drawing.mjParamOff') : `--cw ${Math.round(props.cw)}`
)
const swDisplay = computed(() =>
  props.sw <= 0 || !srefLooksValid.value ? t('drawing.mjParamOff') : `--sw ${Math.round(props.sw)}`
)
const svDisplay = computed(() =>
  props.sv <= 0 || !srefLooksValid.value ? t('drawing.mjParamOff') : `--sv ${Math.round(props.sv)}`
)
const owDisplay = computed(() =>
  props.ow <= 0 || !orefLooksValid.value ? t('drawing.mjParamOff') : `--ow ${Math.round(props.ow)}`
)
const repeatDisplay = computed(() =>
  props.repeat < 2 ? t('drawing.mjParamOff') : `--repeat ${Math.round(props.repeat)}`
)

const v8OutputDisplay = computed(() => {
  if (props.v8OutputMode === 'sd') return '--sd'
  if (props.v8OutputMode === 'hd') return '--hd'
  return t('drawing.mjParamOff')
})
</script>

<template>
  <section
    class="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3"
  >
    <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-500/90">
      {{ t('drawing.mjAdvParamsSection') }}
    </p>
    <p class="mb-3 text-[10px] leading-relaxed text-slate-500">
      {{ t('drawing.mjAdvParamsIntro') }}
    </p>
    <p
      v-if="mjRefCdnLastErr"
      class="mb-3 rounded-lg border border-rose-500/35 bg-rose-950/25 px-2.5 py-2 text-[10px] leading-snug text-rose-100/95"
    >
      {{ mjRefCdnLastErr }}
    </p>

    <!-- 角色参考 --cref / --cw -->
    <div v-if="showCrefCw" class="mb-4 space-y-2 border-b border-slate-700/35 pb-4">
      <p class="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
        {{ t('drawing.mjRefCrefSection') }}
      </p>
      <label class="block text-[11px] font-medium text-slate-200">{{
        t('drawing.mjRefCrefImageLabel')
      }}</label>
      <p class="text-[10px] leading-relaxed text-slate-500">
        {{ t('drawing.mjRefUploadHint') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          ref="crefFileEl"
          type="file"
          tabindex="-1"
          class="hidden"
          :accept="mjRefFileAccept"
          :disabled="crefBusy"
          @change="onRefFileInput($event, 'cref')"
        />
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg border border-cyan-600/50 bg-cyan-950/30 px-2.5 py-1.5 text-[11px] font-medium text-cyan-100 transition hover:border-cyan-500/70 hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="crefBusy"
          @click="crefFileEl?.click()"
        >
          {{ crefBusy ? t('drawing.mjRefUploading') : t('drawing.mjRefUploadBtn') }}
        </button>
        <button
          v-if="crefThumbSrc || crefBusy"
          type="button"
          class="rounded-lg border border-slate-600/60 bg-slate-900/50 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
          :disabled="crefBusy"
          @click="clearRefUrl('cref')"
        >
          {{ t('drawing.mjRefClearBtn') }}
        </button>
      </div>
      <div class="space-y-1">
        <label class="block text-[11px] font-medium text-slate-200">{{
          t('drawing.mjRefHttpsUrlLabel')
        }}</label>
        <p class="text-[10px] leading-relaxed text-slate-500">
          {{ t('drawing.mjRefHttpsFieldHelp') }}
        </p>
        <p v-if="crefStuckShow" class="text-[10px] leading-snug text-amber-200/95">
          {{ t('drawing.mjRefUploadStuckHint') }}
        </p>
        <div class="flex gap-1.5">
          <input
            type="text"
            inputmode="url"
            spellcheck="false"
            autocomplete="off"
            class="min-w-0 flex-1 rounded-lg border border-slate-600/50 bg-slate-950/60 px-2.5 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/25 read-only:cursor-wait read-only:opacity-90"
            :placeholder="t('drawing.mjRefUrlPlaceholder')"
            :readonly="crefBusy"
            :value="crefHttpsLine"
            @input="onCrefHttpsInput($event)"
          />
          <button
            v-if="crefHttpsLine"
            type="button"
            class="shrink-0 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-2 text-[11px] font-medium text-slate-200 hover:border-cyan-500/50 hover:bg-slate-800/70"
            @click="copyText({ text: crefHttpsLine })"
          >
            {{ t('drawing.mjRefCopyHttpsBtn') }}
          </button>
        </div>
      </div>
      <div
        v-if="crefThumbSrc"
        class="flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-950/30 p-2"
      >
        <div
          class="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-600/40"
        >
          <img :src="crefThumbSrc" alt="" class="h-full w-full object-cover" loading="lazy" />
          <div
            v-if="crefBusy"
            class="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-medium text-white"
          >
            {{ t('drawing.mjRefUploading') }}
          </div>
        </div>
        <div class="min-w-0 flex-1 space-y-0.5">
          <p v-if="crefLocalPreview" class="text-[9px] leading-snug text-emerald-400/90">
            {{ t('drawing.mjRefLocalThumbHint') }}
          </p>
        </div>
      </div>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamCwLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ cwDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="100"
        step="1"
        :value="cw"
        @input="emit('update:cw', Number(($event.target as HTMLInputElement).value))"
      />
      <p v-if="cw > 0 && !crefLooksValid" class="text-[10px] text-amber-200/90">
        {{ t('drawing.mjRefNeedUrlHint') }}
      </p>
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamCrefCwHelp') }}
        </p>
      </details>
    </div>

    <!-- 风格参考 --sref / --sw / --sv -->
    <div v-if="showSrefSwSv" class="mb-4 space-y-2 border-b border-slate-700/35 pb-4">
      <p class="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
        {{ t('drawing.mjRefSrefSection') }}
      </p>
      <label class="block text-[11px] font-medium text-slate-200">{{
        t('drawing.mjRefSrefImageLabel')
      }}</label>
      <p class="text-[10px] leading-relaxed text-slate-500">
        {{ t('drawing.mjRefUploadHint') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          ref="srefFileEl"
          type="file"
          tabindex="-1"
          class="hidden"
          :accept="mjRefFileAccept"
          :disabled="srefBusy"
          @change="onRefFileInput($event, 'sref')"
        />
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg border border-cyan-600/50 bg-cyan-950/30 px-2.5 py-1.5 text-[11px] font-medium text-cyan-100 transition hover:border-cyan-500/70 hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="srefBusy"
          @click="srefFileEl?.click()"
        >
          {{ srefBusy ? t('drawing.mjRefUploading') : t('drawing.mjRefUploadBtn') }}
        </button>
        <button
          v-if="srefThumbSrc || srefBusy"
          type="button"
          class="rounded-lg border border-slate-600/60 bg-slate-900/50 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
          :disabled="srefBusy"
          @click="clearRefUrl('sref')"
        >
          {{ t('drawing.mjRefClearBtn') }}
        </button>
      </div>
      <div class="space-y-1">
        <label class="block text-[11px] font-medium text-slate-200">{{
          t('drawing.mjRefHttpsUrlLabel')
        }}</label>
        <p class="text-[10px] leading-relaxed text-slate-500">
          {{ t('drawing.mjRefHttpsFieldHelp') }}
        </p>
        <p v-if="srefStuckShow" class="text-[10px] leading-snug text-amber-200/95">
          {{ t('drawing.mjRefUploadStuckHint') }}
        </p>
        <div class="flex gap-1.5">
          <input
            type="text"
            inputmode="url"
            spellcheck="false"
            autocomplete="off"
            class="min-w-0 flex-1 rounded-lg border border-slate-600/50 bg-slate-950/60 px-2.5 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/25 read-only:cursor-wait read-only:opacity-90"
            :placeholder="t('drawing.mjRefUrlPlaceholder')"
            :readonly="srefBusy"
            :value="srefHttpsLine"
            @input="onSrefHttpsInput($event)"
          />
          <button
            v-if="srefHttpsLine"
            type="button"
            class="shrink-0 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-2 text-[11px] font-medium text-slate-200 hover:border-cyan-500/50 hover:bg-slate-800/70"
            @click="copyText({ text: srefHttpsLine })"
          >
            {{ t('drawing.mjRefCopyHttpsBtn') }}
          </button>
        </div>
      </div>
      <div
        v-if="srefThumbSrc"
        class="flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-950/30 p-2"
      >
        <div
          class="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-600/40"
        >
          <img :src="srefThumbSrc" alt="" class="h-full w-full object-cover" loading="lazy" />
          <div
            v-if="srefBusy"
            class="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-medium text-white"
          >
            {{ t('drawing.mjRefUploading') }}
          </div>
        </div>
        <div class="min-w-0 flex-1 space-y-0.5">
          <p v-if="srefLocalPreview" class="text-[9px] leading-snug text-emerald-400/90">
            {{ t('drawing.mjRefLocalThumbHint') }}
          </p>
        </div>
      </div>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamSwLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ swDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="1000"
        step="1"
        :value="sw"
        @input="emit('update:sw', Number(($event.target as HTMLInputElement).value))"
      />
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamSvLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ svDisplay }}</span>
      </div>
      <div
        class="grid gap-1"
        :style="{
          gridTemplateColumns: `repeat(${svPickerChoices.length}, minmax(0, 1fr))`,
        }"
      >
        <button
          v-for="n in svPickerChoices"
          :key="'sv' + n"
          type="button"
          class="rounded-lg border px-0.5 py-1.5 text-[10px] font-semibold transition"
          :class="
            sv === n
              ? 'border-cyan-500/60 bg-cyan-600/30 text-cyan-100'
              : 'border-slate-600/60 bg-slate-900/50 text-slate-400 hover:border-slate-500'
          "
          @click="emit('update:sv', n)"
        >
          {{ n === 0 ? t('drawing.mjParamOff') : `sv ${n}` }}
        </button>
      </div>
      <p v-if="(sw > 0 || sv > 0) && !srefLooksValid" class="text-[10px] text-amber-200/90">
        {{ t('drawing.mjRefNeedUrlHint') }}
      </p>
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamSrefSwSvHelp') }}
        </p>
      </details>
    </div>

    <!-- Omni --oref / --ow -->
    <div v-if="showOrefOw" class="mb-4 space-y-2 border-b border-slate-700/35 pb-4">
      <p class="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
        {{ t('drawing.mjRefOrefSection') }}
      </p>
      <label class="block text-[11px] font-medium text-slate-200">{{
        t('drawing.mjRefOrefImageLabel')
      }}</label>
      <p class="text-[10px] leading-relaxed text-slate-500">
        {{ t('drawing.mjRefUploadHint') }}
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          ref="orefFileEl"
          type="file"
          tabindex="-1"
          class="hidden"
          :accept="mjRefFileAccept"
          :disabled="orefBusy"
          @change="onRefFileInput($event, 'oref')"
        />
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg border border-cyan-600/50 bg-cyan-950/30 px-2.5 py-1.5 text-[11px] font-medium text-cyan-100 transition hover:border-cyan-500/70 hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          :disabled="orefBusy"
          @click="orefFileEl?.click()"
        >
          {{ orefBusy ? t('drawing.mjRefUploading') : t('drawing.mjRefUploadBtn') }}
        </button>
        <button
          v-if="orefThumbSrc || orefBusy"
          type="button"
          class="rounded-lg border border-slate-600/60 bg-slate-900/50 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
          :disabled="orefBusy"
          @click="clearRefUrl('oref')"
        >
          {{ t('drawing.mjRefClearBtn') }}
        </button>
      </div>
      <div class="space-y-1">
        <label class="block text-[11px] font-medium text-slate-200">{{
          t('drawing.mjRefHttpsUrlLabel')
        }}</label>
        <p class="text-[10px] leading-relaxed text-slate-500">
          {{ t('drawing.mjRefHttpsFieldHelp') }}
        </p>
        <p v-if="orefStuckShow" class="text-[10px] leading-snug text-amber-200/95">
          {{ t('drawing.mjRefUploadStuckHint') }}
        </p>
        <div class="flex gap-1.5">
          <input
            type="text"
            inputmode="url"
            spellcheck="false"
            autocomplete="off"
            class="min-w-0 flex-1 rounded-lg border border-slate-600/50 bg-slate-950/60 px-2.5 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/25 read-only:cursor-wait read-only:opacity-90"
            :placeholder="t('drawing.mjRefUrlPlaceholder')"
            :readonly="orefBusy"
            :value="orefHttpsLine"
            @input="onOrefHttpsInput($event)"
          />
          <button
            v-if="orefHttpsLine"
            type="button"
            class="shrink-0 rounded-lg border border-slate-600/50 bg-slate-900/60 px-2.5 py-2 text-[11px] font-medium text-slate-200 hover:border-cyan-500/50 hover:bg-slate-800/70"
            @click="copyText({ text: orefHttpsLine })"
          >
            {{ t('drawing.mjRefCopyHttpsBtn') }}
          </button>
        </div>
      </div>
      <div
        v-if="orefThumbSrc"
        class="flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-950/30 p-2"
      >
        <div
          class="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-600/40"
        >
          <img :src="orefThumbSrc" alt="" class="h-full w-full object-cover" loading="lazy" />
          <div
            v-if="orefBusy"
            class="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-medium text-white"
          >
            {{ t('drawing.mjRefUploading') }}
          </div>
        </div>
        <div class="min-w-0 flex-1 space-y-0.5">
          <p v-if="orefLocalPreview" class="text-[9px] leading-snug text-emerald-400/90">
            {{ t('drawing.mjRefLocalThumbHint') }}
          </p>
        </div>
      </div>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamOwLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ owDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="1000"
        step="1"
        :value="ow"
        @input="emit('update:ow', Number(($event.target as HTMLInputElement).value))"
      />
      <p v-if="ow > 0 && !orefLooksValid" class="text-[10px] text-amber-200/90">
        {{ t('drawing.mjRefNeedUrlHint') }}
      </p>
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamOrefOwHelp') }}
        </p>
      </details>
    </div>

    <!-- --tile / --draft / --repeat -->
    <div class="mb-4 space-y-3 border-b border-slate-700/35 pb-4">
      <label class="flex cursor-pointer items-center gap-2.5 text-[11px] text-slate-200">
        <input
          type="checkbox"
          class="checkbox checkbox-sm checkbox-primary rounded border-slate-600"
          :checked="tile"
          @change="emit('update:tile', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('drawing.mjParamTileLabel') }}</span>
      </label>
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamTileHelp') }}
        </p>
      </details>

      <template v-if="showDraft">
        <label
          class="flex cursor-pointer items-center gap-2.5 text-[11px] text-slate-200"
          :class="orefOfficialComboLock ? 'cursor-not-allowed opacity-60' : ''"
        >
          <input
            type="checkbox"
            class="checkbox checkbox-sm checkbox-primary rounded border-slate-600"
            :disabled="orefOfficialComboLock"
            :checked="draft"
            @change="emit('update:draft', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('drawing.mjParamDraftLabel') }}</span>
        </label>
        <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
          <summary
            class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
          >
            {{ t('drawing.mjParamHelpFold') }}
          </summary>
          <p
            class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
          >
            {{ t('drawing.mjParamDraftHelp') }}
          </p>
        </details>
      </template>

      <div v-if="showV8Output" class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[11px] font-medium text-slate-200">{{
            t('drawing.mjParamV8OutputLabel')
          }}</span>
          <span class="font-mono text-[11px] text-cyan-300/95">{{ v8OutputDisplay }}</span>
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="opt in ['off', 'sd', 'hd'] as const"
            :key="opt"
            type="button"
            class="min-h-[1.75rem] flex-1 rounded-lg border px-1.5 py-1 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px]"
            :class="
              v8OutputMode === opt
                ? 'border-cyan-500/60 bg-cyan-900/40 text-cyan-100'
                : 'border-slate-600/70 bg-slate-900/50 text-slate-400 hover:border-slate-500'
            "
            @click="emit('update:v8OutputMode', opt)"
          >
            {{
              opt === 'off'
                ? t('drawing.mjV8OutOff')
                : opt === 'sd'
                  ? t('drawing.mjV8OutSd')
                  : t('drawing.mjV8OutHd')
            }}
          </button>
        </div>
        <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
          <summary
            class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
          >
            {{ t('drawing.mjParamHelpFold') }}
          </summary>
          <p
            class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
          >
            {{ t('drawing.mjParamV8OutputHelp') }}
          </p>
        </details>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[11px] font-medium text-slate-200">{{
            t('drawing.mjParamRepeatLabel')
          }}</span>
          <span class="font-mono text-[11px] text-cyan-300/95">{{ repeatDisplay }}</span>
        </div>
        <input
          type="range"
          class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
          min="0"
          max="40"
          step="1"
          :value="repeat"
          @input="emit('update:repeat', Number(($event.target as HTMLInputElement).value))"
        />
        <p class="text-[10px] leading-relaxed text-slate-500">
          {{ t('drawing.mjParamRepeatHint') }}
        </p>
      </div>
    </div>

    <!-- --iw 仅图生图 -->
    <div v-if="showIw" class="mb-4 space-y-1.5 border-b border-slate-700/35 pb-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamIwLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ iwDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="100"
        step="1"
        :value="iw"
        @input="emit('update:iw', Number(($event.target as HTMLInputElement).value))"
      />
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamIwHelp') }}
        </p>
      </details>
    </div>

    <!-- --stylize -->
    <div class="mb-4 space-y-1.5 border-b border-slate-700/35 pb-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamStylizeLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ stylizeDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="1000"
        step="1"
        :value="stylize"
        @input="emit('update:stylize', Number(($event.target as HTMLInputElement).value))"
      />
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamStylizeHelp') }}
        </p>
      </details>
    </div>

    <!-- --chaos -->
    <div class="mb-4 space-y-1.5 border-b border-slate-700/35 pb-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamChaosLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ chaosDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="100"
        step="1"
        :value="chaos"
        @input="emit('update:chaos', Number(($event.target as HTMLInputElement).value))"
      />
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamChaosHelp') }}
        </p>
      </details>
    </div>

    <!-- --weird -->
    <div class="mb-4 space-y-1.5 border-b border-slate-700/35 pb-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamWeirdLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ weirdDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="3000"
        step="5"
        :value="weird"
        @input="emit('update:weird', Number(($event.target as HTMLInputElement).value))"
      />
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamWeirdHelp') }}
        </p>
      </details>
    </div>

    <!-- --stop -->
    <div class="mb-4 space-y-1.5 border-b border-slate-700/35 pb-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamStopLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{ stopDisplay }}</span>
      </div>
      <input
        type="range"
        class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-500 disabled:cursor-not-allowed"
        min="0"
        max="100"
        step="10"
        :value="stop"
        @input="emit('update:stop', Number(($event.target as HTMLInputElement).value))"
      />
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamStopHelp') }}
        </p>
      </details>
    </div>

    <!-- --quality 离散 -->
    <div class="mb-4 space-y-1.5 border-b border-slate-700/35 pb-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium text-slate-200">{{
          t('drawing.mjParamQualityLabel')
        }}</span>
        <span class="font-mono text-[11px] text-cyan-300/95">{{
          quality <= 0 ? t('drawing.mjParamOff') : `--q ${qualityLabels[quality]}`
        }}</span>
      </div>
      <div class="grid grid-cols-5 gap-1">
        <button
          v-for="n in [0, 1, 2, 3, 4]"
          :key="n"
          type="button"
          :disabled="orefOfficialComboLock && n === 4"
          class="rounded-lg border px-1 py-1.5 text-[10px] font-semibold transition"
          :class="[
            quality === n
              ? 'border-cyan-500/60 bg-cyan-600/30 text-cyan-100'
              : 'border-slate-600/60 bg-slate-900/50 text-slate-400 hover:border-slate-500',
            orefOfficialComboLock && n === 4 ? 'cursor-not-allowed opacity-40' : '',
          ]"
          @click="setQuality(n)"
        >
          {{ n === 0 ? t('drawing.mjParamQualityOff') : `q ${qualityLabels[n]}` }}
        </button>
      </div>
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjParamQualityHelp') }}
        </p>
      </details>
    </div>

    <!-- Raw（官方为 --raw） -->
    <div class="space-y-1.5">
      <label class="flex cursor-pointer items-center gap-2.5 text-[11px] text-slate-200">
        <input
          type="checkbox"
          class="checkbox checkbox-sm checkbox-primary rounded border-slate-600"
          :checked="styleRaw"
          @change="emit('update:styleRaw', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('drawing.mjStyleRawLabel') }}</span>
      </label>
      <details class="rounded-lg bg-slate-950/40 text-[10px] text-slate-500">
        <summary
          class="cursor-pointer list-none px-2 py-1.5 text-slate-400 hover:text-slate-300 [&::-webkit-details-marker]:hidden"
        >
          {{ t('drawing.mjParamHelpFold') }}
        </summary>
        <p
          class="border-t border-slate-700/30 px-2 pb-2 pt-1.5 whitespace-pre-line leading-relaxed"
        >
          {{ t('drawing.mjStyleRawHelp') }}
        </p>
      </details>
    </div>
  </section>
</template>
