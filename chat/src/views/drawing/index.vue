<script setup lang="ts">
import {
  batchUpsertMjDrawingJobs,
  deleteMjDrawingJob,
  fetchMjDrawingJobsList,
  fetchMjImageSeed,
  fetchMjTask,
  listMjTasksByIds,
  submitMjAction,
  submitMjBlend,
  submitMjChange,
  submitMjDescribe,
  submitMjEdits,
  submitMjImagine,
  submitMjShorten,
  submitMjSimpleChange,
  type MjDrawingJobDto,
  type MjDrawingJobSnapshot,
  type MjSpeedMode,
} from '@/api/drawingMj'
import { fetchChatAPIProcess } from '@/api'
import { fetchUpdateGroupAPI } from '@/api/group'
import { fetchDrawingModelsListAPI } from '@/api/models'
import BadWordsDialog from '@/components/Dialogs/BadWordsDialog.vue'
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import DrawingStudioSidebar from '@/components/drawing/DrawingStudioSidebar.vue'
import DrawingUploadPreviewGrid from '@/components/drawing/DrawingUploadPreviewGrid.vue'
import MjTaskImage from '@/components/drawing/MjTaskImage.vue'
import type {
  MjBlendDimensions,
  MjNijiVersion,
  MjRealisticVersion,
  MjStyle,
  StudioTab,
} from '@/components/drawing/DrawingStudioSidebar.vue'
import Login from '@/components/Login/Login.vue'
import MobileSettingsDialog from '@/components/MobileSettingsDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import { STORAGE_KEY_DRAWING_BIND_GROUP } from '@/utils/drawingClientStorage'
import {
  mjDrawingRefCrefKey,
  mjDrawingRefOrefKey,
  mjDrawingRefSrefKey,
} from '@/utils/mjDrawingInjectKeys'
import {
  collectMjImageUrls,
  extractMjViewerCaptions,
  extractMjTaskId,
  inferMjRunningPhase,
  isMjSubmitAcceptedCode,
  MJ_TASK_POLL_INTERVAL_MS,
  mjTaskPollMaxIterations,
  mjTaskPollOutcome,
  nestResultErrorMessage,
  parseMjImageSeedBody,
  parseMjProgressPercent,
  normalizeMjSubmitCode,
  parseMjSubmitBody,
  parseMjTaskBody,
  mjTaskFailureHintKey,
  mjTaskFailureHintKeyFromTask,
  mjKnownDrawingErrorI18nKey,
  mjTranslateKnownDrawingError,
  mjExtRefUrlSanitized,
  mjClipExtRefUrlForStorage,
} from '@/utils/mjApiParse'
import {
  mjVersionSupportsCref,
  mjVersionSupportsDraft,
  mjVersionSupportsOref,
  mjVersionSupportsSref,
  mjVersionSupportsSvValue,
} from '@/utils/mjParamVersionSupport'
import {
  guessMjImagineChargeMultiplier,
  mjEstimatedDeductTotal,
  parseMjImagineChargeMultipliersJson,
} from '@/utils/mjChargeEstimate'
import {
  buildMjFollowUpPromptLabel,
  formatMjUpstreamButtonLabel,
  groupMjMiscButtons,
  mjButtonIsVaryRegion,
  mjButtonIsCustomZoom,
  mjMiscButtonHintKey,
  mjMiscButtonPolicyBlockReason,
  mjMiscPolicyBlockFromProbeText,
  mjMiscGroupIntroKey,
  mjMiscGroupTitleKey,
  type MjFollowBtn,
  type MjMiscGroup,
} from '@/utils/mjFollowUpUi'
import MjVaryRegionModal from '@/components/drawing/MjVaryRegionModal.vue'
import HeaderComponent from '@/views/chat/components/Header/index.vue'
import Sider from '@/views/chat/components/sider/index.vue'
import { useChat } from '@/views/chat/hooks/useChat'
import { watchDebounced } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'

type SpellMode = 'describe' | 'shorten'
/** 写实 V8：与侧栏 Midjourney 高级参数中的 SD/HD 一致 */
type MjV8OutputMode = 'off' | 'sd' | 'hd'

interface DrawingModel {
  modelName: string
  keyType: number
  model: string
  deduct: number
  deductType: number
  deductMjFast?: number | null
  deductMjTurbo?: number | null
  deductMjRelax?: number | null
  maxRounds?: number
  modelAvatar?: string
  modelDescription?: string
  isFileUpload?: number
  isImageUpload?: number
  isNetworkSearch?: boolean
  deepThinkingType?: number
  deductDeepThink?: number
  isMcpTool?: boolean
  drawingType: number
}

interface ResultItem {
  id: number
  prompt: string
  text: string
  loading: boolean
  error?: string
}

interface MjJobItem {
  localId: number
  /** 服务端 drawing_mj_job.id，云端同步用 */
  serverJobId?: number
  taskId: string
  /** 本任务所基于的上一任务 MJ taskId（放大/变体等后续） */
  parentTaskId?: string
  /** 上一任务在本列表中的 localId，用于唯一定位与滚动 */
  parentLocalId?: number
  /** 提交时的模型 model 字段，用于恢复轮询 */
  modelKey?: string
  mjModeSnapshot?: MjSpeedMode
  promptLabel: string
  loading: boolean
  error?: string
  task?: Record<string, unknown>
  mjStyleSnapshot?: MjStyle
  /** 本次提交扣费积分（与后端 withBalance 估算一致） */
  deductCharged?: number
  chargeMult?: number
  deductTypeSnapshot?: number
  /** 客户端排队/绘制耗时起点（毫秒时间戳） */
  queuedAtMs?: number
}

const MJ_TYPE = 3
const MJ_JOBS_STORAGE_VER = 1
const MAX_MJ_JOBS_STORED = 80
/** batch-upsert 与 DELETE 竞争时最多重试轮数（含 stale 重试） */
const MAX_MJ_PERSIST_ROUNDS = 48

/** 避免同一毫秒内多条任务共用 localId，导致 loadMjJobsFromApi 的 Map 覆盖、serverJobId 错乱 */
let mjClientKeySeq = 0
function nextMjClientKey(): number {
  mjClientKeySeq += 1
  return Date.now() * 10000 + (mjClientKeySeq % 10000)
}
const STORAGE_KEY_MJ_FOLLOWUP_LAYOUT = 'hoai_mj_followup_layout'

type MjFollowUpLayout = 'tiled' | 'dropdown'

function loadMjFollowUpLayout(): MjFollowUpLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MJ_FOLLOWUP_LAYOUT)
    if (raw === 'dropdown' || raw === 'tiled') return raw
  } catch {
    /* ignore */
  }
  return 'tiled'
}

const mjFollowUpLayout = ref<MjFollowUpLayout>(loadMjFollowUpLayout())

watch(mjFollowUpLayout, v => {
  try {
    localStorage.setItem(STORAGE_KEY_MJ_FOLLOWUP_LAYOUT, v)
  } catch {
    /* ignore */
  }
})
const persistMjJobsReady = ref(false)

const aspectKeyToSuffix: Record<string, string> = {
  '1:1': '--ar 1:1',
  '3:2': '--ar 3:2',
  '3:4': '--ar 3:4',
  '4:3': '--ar 4:3',
  '9:16': '--ar 9:16',
  '16:9': '--ar 16:9',
}

/** 自定义 --ar，解析为「宽:高」；非法则返回 null（提交时回退 1:1） */
function parseMjCustomAspect(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, '')
  const m = /^(\d{1,4}):(\d{1,4})$/.exec(s)
  if (!m) return null
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 9999 || h > 9999)
    return null
  return `${w}:${h}`
}

function buildModelConfig(m: DrawingModel) {
  return {
    modelInfo: {
      keyType: m.keyType,
      modelName: m.modelName,
      model: m.model,
      deductType: m.deductType,
      deduct: m.deduct,
      /** 与 router「绘画会话组」识别一致；缺省时守卫无法从 MJ 组切回普通对话 */
      drawingType: m.drawingType ?? 0,
      isFileUpload: m.isFileUpload ?? 0,
      isImageUpload: m.isImageUpload ?? 0,
      modelAvatar: m.modelAvatar ?? '',
      modelDescription: m.modelDescription ?? '',
      isNetworkSearch: m.isNetworkSearch ?? false,
      deepThinkingType: m.deepThinkingType ?? 0,
      deductDeepThink: m.deductDeepThink ?? 1,
      isMcpTool: m.isMcpTool ?? false,
    },
  }
}

function extractImageUrls(text: string): string[] {
  if (!text) return []
  const urls = new Set<string>()
  const md = /!\[[^\]]*\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = md.exec(text))) urls.add(m[1])
  const plain = /https?:\/\/[^\s"'<>）]+\.(?:png|jpg|jpeg|webp|gif)(\?[^\s"'<>）]*)?/gi
  while ((m = plain.exec(text))) urls.add(m[0])
  return [...urls]
}

/** 与 DrawingStudioSidebar 一致，改善部分浏览器对 file 选择器的支持 */
const MJ_DRAWING_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp,image/*'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

/** 图生图 / 描述等：降采样 + JPEG 压体积，减少 JSON 体被网关 413 截断 */
const MJ_REF_IMAGE_MAX_EDGE = 2048
const MJ_REF_JPEG_QUALITY = 0.88

/**
 * 混图专用：比 i2i 更保守的最长边 + 统一 JPEG，降低像素数与 base64 体积。
 * 部分聚合在执行期对超大参考图报 invalid_parameter（文案常写成「提示词格式」）。
 */
const MJ_BLEND_IMAGE_MAX_EDGE = 1024
const MJ_BLEND_JPEG_QUALITY = 0.86

async function fileToMjDataUrl(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file)
    try {
      let { width, height } = bmp
      const maxE = MJ_REF_IMAGE_MAX_EDGE
      if (width > maxE || height > maxE) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxE) / width))
          width = maxE
        } else {
          width = Math.max(1, Math.round((width * maxE) / height))
          height = maxE
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return fileToBase64(file)
      ctx.drawImage(bmp, 0, 0, width, height)
      const jpegish =
        file.type === 'image/jpeg' ||
        file.type === 'image/jpg' ||
        file.type === 'image/bmp' ||
        /\.(jpe?g|bmp)$/i.test(file.name)
      if (jpegish) return canvas.toDataURL('image/jpeg', MJ_REF_JPEG_QUALITY)
      return canvas.toDataURL('image/png')
    } finally {
      bmp.close()
    }
  } catch {
    return fileToBase64(file)
  }
}

async function fileToMjBlendDataUrl(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file)
    try {
      let { width, height } = bmp
      const maxE = MJ_BLEND_IMAGE_MAX_EDGE
      if (width > maxE || height > maxE) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxE) / width))
          width = maxE
        } else {
          width = Math.max(1, Math.round((width * maxE) / height))
          height = maxE
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return fileToMjDataUrl(file)
      ctx.drawImage(bmp, 0, 0, width, height)
      return canvas.toDataURL('image/jpeg', MJ_BLEND_JPEG_QUALITY)
    } finally {
      bmp.close()
    }
  } catch {
    return fileToMjDataUrl(file)
  }
}

/** 局部重绘蒙版需保留透明度，仅做大图降采样，统一 PNG */
const MJ_MASK_MAX_EDGE = 4096

async function fileToMjMaskDataUrl(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file)
    try {
      let { width, height } = bmp
      const maxE = MJ_MASK_MAX_EDGE
      if (width > maxE || height > maxE) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxE) / width))
          width = maxE
        } else {
          width = Math.max(1, Math.round((width * maxE) / height))
          height = maxE
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return fileToBase64(file)
      ctx.drawImage(bmp, 0, 0, width, height)
      return canvas.toDataURL('image/png')
    } finally {
      bmp.close()
    }
  } catch {
    return fileToBase64(file)
  }
}

const ms = message()
const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const { isMobile } = useBasicLayout()
const { addGroupChat, updateGroupChatSome } = useChat()

const collapsed = computed(() => appStore.siderCollapsed)
const isLogin = computed(() => authStore.isLogin)
const isStreamIn = computed(() => chatStore.isStreamIn !== undefined && chatStore.isStreamIn)

const drawingModels = ref<DrawingModel[]>([])
const selectedModelKey = ref('')
const promptText = ref('')
const extraSize = ref('1024x1024')
const results = ref<ResultItem[]>([])
const drawingSessionGroupId = ref<number | null>(null)
const controller = ref<AbortController | null>(null)
const modelsLoading = ref(false)

const mjMode = ref<MjSpeedMode>('fast')
const studioTab = ref<StudioTab>('t2i')
const spellMode = ref<SpellMode>('describe')
const mjStyle = ref<MjStyle>('realistic')
const negativePrompt = ref('')
const aspectKey = ref('1:1')
/** 选择「自定义」比例时的宽:高文案 */
const aspectCustomRatio = ref('2:1')
/** 写实模式 --v 主模型版本（Midjourney 文档：--v 7 等为模型代数） */
const mjRealisticVersion = ref<MjRealisticVersion>('7')
/** 动漫模式 --niji 代数 */
const mjNijiVersion = ref<MjNijiVersion>('6')
/** 可选 --seed（0～4294967295），空则不附加 */
const mjSeed = ref('')
/** 开启后不在提示词中自动拼 --ar / --v / --niji / --seed / --no；侧栏「高级参数」（cref/sref、--s、垫图 --iw 等）仍会附加 */
const mjCustomParamsOnly = ref(false)
/** Midjourney 高级参数：0 表示不附加该项；--iw 仅在与垫图一并提交时写入 */
const mjParamIw = ref(0)
const mjParamStylize = ref(0)
const mjParamChaos = ref(0)
const mjParamWeird = ref(0)
const mjParamStop = ref(0)
/** 0 关；1=.25 / 2=.5 / 3=1 / 4=2 */
const mjParamQuality = ref(0)
const mjStyleRaw = ref(false)
/** 角色 / 风格 / Omni 参考图直链（与官方 --cref / --sref / --oref 一致） */
const mjRefCrefUrl = ref('')
const mjParamCw = ref(0)
const mjRefSrefUrl = ref('')
const mjParamSw = ref(0)
const mjParamSv = ref(0)
const mjRefOrefUrl = ref('')
const mjParamOw = ref(0)
const mjParamTile = ref(false)
const mjParamDraft = ref(false)
/** 写实 V8：附加 --sd 或 --hd（官方 V8.1 文档；互斥） */
const mjV8OutputMode = ref<MjV8OutputMode>('off')
/** 0/1 关；2～40 对应 --repeat（上限随订阅档位变化） */
const mjParamRepeat = ref(0)
/** cref/sref/oref 图床上传中（与 MjImagineAdvParams 的 mjRefUploading 同步） */
const mjRefUploading = ref(false)

provide(mjDrawingRefCrefKey, mjRefCrefUrl)
provide(mjDrawingRefSrefKey, mjRefSrefUrl)
provide(mjDrawingRefOrefKey, mjRefOrefUrl)

const MJ_CUSTOM_PARAMS_LS = 'hoai_drawing_mj_custom_params_only'
const MJ_VER_LS = 'hoai_drawing_mj_realistic_version'
const MJ_NIJI_LS = 'hoai_drawing_mj_niji_version'
const MJ_SEED_LS = 'hoai_drawing_mj_seed'
/** 滑杆高级参数持久化（0 表示不附加） */
const MJ_ADV_SLIDERS_LS = 'hoai_drawing_mj_adv_sliders_v1'
const mjSubmitting = ref(false)
const taskSearchQuery = ref('')
const mjJobs = ref<MjJobItem[]>([])
/** 任意任务在绘制中时每秒递增，驱动「已耗时」文案刷新 */
const mjElapsedTick = ref(0)
let mjDrawElapsedTimer: ReturnType<typeof setInterval> | null = null
watch(
  () => mjJobs.value.some(j => j.loading),
  active => {
    if (active) {
      if (!mjDrawElapsedTimer)
        mjDrawElapsedTimer = setInterval(() => {
          mjElapsedTick.value++
        }, 1000)
    } else if (mjDrawElapsedTimer) {
      clearInterval(mjDrawElapsedTimer)
      mjDrawElapsedTimer = null
    }
  },
  { immediate: true }
)
/** 列表内「跳转到上一步」短时高亮的目标 localId */
const mjParentHighlightLocalId = ref<number | null>(null)
let mjParentHighlightTimer: ReturnType<typeof setTimeout> | null = null
/** 与云端 users.mj_jobs_sync_seq 对齐；每次 DELETE 递增，batch-upsert 须带 baseSyncSeq */
const mjListSyncSeq = ref(0)
const implyBase64List = ref<string[]>([])
const blendBase64List = ref<string[]>([])
const blendDimensions = ref<MjBlendDimensions>('SQUARE')
const editsImageUrl = ref('')
const editsMaskBase64 = ref('')
/** 侧栏 Edits 图片来源任务 localId；与 editsImageUrl 一致时提交 Edits 自动挂父任务 */
const editsSourceLocalId = ref<number | null>(null)
const mjChangeTaskId = ref('')
const mjChangeAction = ref('UPSCALE')
const mjChangeIndex = ref(1)
const mjSimpleChangeContent = ref('')
const mjBatchSyncing = ref(false)
const describeBase64 = ref('')
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()

const selectedModel = computed(() =>
  drawingModels.value.find(x => x.model === selectedModelKey.value)
)

const mjImagineMultsParsed = computed(() =>
  parseMjImagineChargeMultipliersJson(authStore.globalConfig?.mjImagineChargeMultipliers)
)

function mjParentFieldsFromSource(
  source?: MjJobItem | null
): Pick<MjJobItem, 'parentTaskId' | 'parentLocalId'> {
  if (!source) return {}
  const tid = String(source.taskId || '').trim()
  const out: Pick<MjJobItem, 'parentTaskId' | 'parentLocalId'> = {}
  if (tid) out.parentTaskId = tid
  if (Number.isFinite(source.localId)) out.parentLocalId = source.localId
  return out
}

function mjJobsStorageKey(): string {
  const uid = authStore.userInfo?.id
  return `hoai_drawing_mj_jobs_v${MJ_JOBS_STORAGE_VER}_${uid ?? 'guest'}`
}

function attachMjJobModelMeta(job: MjJobItem, m: DrawingModel, opts?: { mjMode?: MjSpeedMode }) {
  job.modelKey = m.model
  job.mjModeSnapshot = opts?.mjMode ?? mjMode.value
}

/**
 * 父任务链上的后续操作（U/V/放大/扩图/局部重绘/Custom Zoom 弹窗提交等）必须与**该任务出图时**的速度一致：
 * 快速 → `/mj`、极速 → `/mj-turbo/mj`、慢速 → `/mj-relax/mj`。
 * 勿使用侧栏当前选中模式，否则与上游任务通道不一致，易出现 invalid_parameter。
 * 无父任务或旧数据缺 mjModeSnapshot 时回退为侧栏当前模式。
 */
function mjModeForFollowUp(parent: MjJobItem | undefined | null): MjSpeedMode {
  return parent?.mjModeSnapshot ?? mjMode.value
}

function assignMjJobChargeSnapshot(
  job: MjJobItem,
  m: DrawingModel,
  spec: { kind: 'mult'; mult: number } | { kind: 'prompt'; fullPrompt: string }
) {
  const mode = job.mjModeSnapshot || 'fast'
  const mult =
    spec.kind === 'prompt'
      ? guessMjImagineChargeMultiplier(spec.fullPrompt, mjImagineMultsParsed.value)
      : spec.mult
  job.deductCharged = mjEstimatedDeductTotal(m, mode, mult)
  job.chargeMult = mult
  job.deductTypeSnapshot = m.deductType
}

function mjJobDeductTypeLabel(dt: number | undefined): string {
  if (dt === 1) return t('chat.ordinaryPoints')
  if (dt === 2) return t('chat.advancedPoints')
  if (dt === 3) return t('chat.drawingPoints')
  return t('chat.points')
}

/** 任务卡片副标题：速度与扣费说明（与后端 withBalance 规则一致） */
function mjJobChargeMetaLine(job: MjJobItem): string {
  const parts: string[] = []
  const mode = job.mjModeSnapshot
  if (mode === 'turbo') parts.push(t('drawing.mjSpeedTurbo'))
  else if (mode === 'relax') parts.push(t('drawing.mjSpeedRelax'))
  else if (mode === 'fast') parts.push(t('drawing.mjSpeedFast'))
  if (job.deductCharged != null && Number.isFinite(Number(job.deductCharged))) {
    const typeName = mjJobDeductTypeLabel(job.deductTypeSnapshot)
    let s = t('drawing.mjChargedPoints', { n: job.deductCharged, typeName })
    const cm = job.chargeMult
    if (cm != null && Number(cm) !== 1 && Number.isFinite(Number(cm))) {
      s += t('drawing.mjChargeMultSuffix', { mult: cm })
    }
    parts.push(s)
  }
  return parts.join(' · ')
}

function persistMjJobsToStorage() {
  try {
    const jobs = mjJobs.value.slice(0, MAX_MJ_JOBS_STORED)
    localStorage.setItem(
      mjJobsStorageKey(),
      JSON.stringify({ v: MJ_JOBS_STORAGE_VER, savedAt: Date.now(), jobs })
    )
  } catch {
    /* quota */
  }
}

function loadMjJobsFromStorage(): MjJobItem[] {
  try {
    const raw = localStorage.getItem(mjJobsStorageKey())
    if (!raw) return []
    const o = JSON.parse(raw) as { v?: number; jobs?: unknown }
    if (o?.v !== MJ_JOBS_STORAGE_VER || !Array.isArray(o.jobs)) return []
    return o.jobs
      .filter((j: unknown) => j && typeof (j as MjJobItem).localId === 'number')
      .slice(0, MAX_MJ_JOBS_STORED)
      .map(j => {
        const item = j as MjJobItem
        return {
          ...item,
          loading: Boolean(item.loading),
          task: item.task && typeof item.task === 'object' ? item.task : undefined,
        }
      })
  } catch {
    return []
  }
}

function mjDrawingJobDtoToLocal(row: MjDrawingJobDto): MjJobItem {
  return {
    localId: row.clientKey ?? row.id,
    serverJobId: row.id,
    taskId: row.taskId || '',
    parentTaskId: row.parentTaskId?.trim() || undefined,
    parentLocalId:
      typeof row.parentClientKey === 'number' && Number.isFinite(row.parentClientKey)
        ? row.parentClientKey
        : undefined,
    modelKey: row.modelKey,
    mjModeSnapshot: row.mjMode,
    mjStyleSnapshot: (row.mjStyleSnapshot as MjStyle | undefined) ?? 'realistic',
    promptLabel: row.promptLabel,
    loading: !!row.loading,
    error: row.error,
    task: row.task,
    deductCharged: row.deductCharged,
    chargeMult: row.chargeMult,
    deductTypeSnapshot: row.deductTypeSnapshot,
  }
}

function mjJobToSnapshot(job: MjJobItem): MjDrawingJobSnapshot {
  return {
    clientKey: job.localId,
    taskId: job.taskId || undefined,
    parentTaskId: job.parentTaskId?.trim() || undefined,
    parentClientKey: job.parentLocalId,
    modelKey: job.modelKey || '',
    mjMode: job.mjModeSnapshot || 'fast',
    mjStyleSnapshot: job.mjStyleSnapshot,
    promptLabel: job.promptLabel,
    loading: job.loading,
    error: job.error,
    task: job.task,
    deductCharged: job.deductCharged,
    chargeMult: job.chargeMult,
    deductTypeSnapshot: job.deductTypeSnapshot,
  }
}

/** 用于判断 await batch-upsert 期间 mjJobs 是否已变（debounced watch 有延迟，仅靠 mjPersistDirty 会漏） */
function mjPersistCoalesceSig(): string {
  return mjJobs.value
    .slice(0, MAX_MJ_JOBS_STORED)
    .map(j => `${j.localId}:${j.serverJobId ?? ''}:${j.loading ? 1 : 0}:${j.taskId || ''}`)
    .join('|')
}

async function loadMjJobsFromApi(): Promise<void> {
  if (!authStore.isLogin) return
  try {
    const res = await fetchMjDrawingJobsList({ limit: MAX_MJ_JOBS_STORED })
    const payload = res.data
    const incoming = (payload?.list ?? []).map(mjDrawingJobDtoToLocal)
    if (typeof payload?.syncSeq === 'number') mjListSyncSeq.value = payload.syncSeq
    const map = new Map<number, MjJobItem>()
    for (const j of incoming) map.set(j.localId, j)
    /**
     * 仅以服务端列表为「成员」来源：仅当该行仍在云端时才合并本地更丰富的 task。
     * 旧逻辑在 hit 为空时 map.set(cur.localId, cur)，会把已 DELETE 的任务从内存复活（刷新/二次拉列表常见）。
     */
    for (const cur of [...mjJobs.value]) {
      const hit = map.get(cur.localId)
      if (hit) map.set(cur.localId, mergeMjJobWithRemote(cur, hit))
    }
    mjJobs.value = [...map.values()].sort((a, b) => b.localId - a.localId)
    persistMjJobsToStorage()
  } catch {
    mjJobs.value = loadMjJobsFromStorage()
  }
}

/**
 * 并发 batch-upsert 若乱序完成，较慢的旧请求会把已删除任务重新写入库。
 * - 前端：队列 + await 后比对 mjPersistCoalesceSig；
 * - 服务端：DELETE 递增 mj_jobs_sync_seq，batch-upsert 携带 baseSyncSeq，陈旧快照直接拒绝（防复活）。
 */
let mjPersistInFlight = false
let mjPersistDirty = false

async function persistMjJobsHybrid() {
  if (!persistMjJobsReady.value) return
  if (mjPersistInFlight) {
    mjPersistDirty = true
    return
  }
  mjPersistInFlight = true
  try {
    let persistRound = 0
    do {
      persistRound++
      if (persistRound > MAX_MJ_PERSIST_ROUNDS) {
        mjPersistDirty = false
        break
      }
      mjPersistDirty = false
      if (authStore.isLogin) {
        try {
          const sigBefore = mjPersistCoalesceSig()
          const jobs = mjJobs.value.slice(0, MAX_MJ_JOBS_STORED).map(mjJobToSnapshot)
          const api = await batchUpsertMjDrawingJobs({
            jobs,
            baseSyncSeq: mjListSyncSeq.value,
          })
          const inner = api.data
          if (inner?.stale === true) {
            if (typeof inner.syncSeq === 'number') mjListSyncSeq.value = inner.syncSeq
            mjPersistDirty = true
            continue
          }
          if (typeof inner?.syncSeq === 'number') mjListSyncSeq.value = inner.syncSeq
          if (sigBefore !== mjPersistCoalesceSig()) {
            mjPersistDirty = true
          }
        } catch {
          persistMjJobsToStorage()
        }
      } else {
        persistMjJobsToStorage()
      }
    } while (mjPersistDirty)
  } finally {
    mjPersistInFlight = false
    if (mjPersistDirty) {
      mjPersistDirty = false
      void persistMjJobsHybrid()
    }
  }
}

const isMjModel = computed(() => Number(selectedModel.value?.drawingType) === MJ_TYPE)

const mjCustomAspectParsed = computed(() => parseMjCustomAspect(aspectCustomRatio.value))

const aspectCustomInvalid = computed(
  () => aspectKey.value === 'custom' && !mjCustomAspectParsed.value
)

const mjArSuffix = computed(() => {
  if (aspectKey.value === 'custom') {
    const ar = mjCustomAspectParsed.value
    return ar ? `--ar ${ar}` : '--ar 1:1'
  }
  return aspectKeyToSuffix[aspectKey.value] || '--ar 1:1'
})

/** Midjourney --seed：文档约定非负整数，常用上限 2^32-1 */
function mjSeedSuffix(seedRaw: string): string | null {
  const s = seedRaw.trim()
  if (!s || !/^\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 4294967295) return null
  return `--seed ${Math.floor(n)}`
}

function mjSupportsCrefInPrompt(): boolean {
  return mjVersionSupportsCref(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)
}

function mjSupportsSrefInPrompt(): boolean {
  return mjVersionSupportsSref(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)
}

function mjSupportsOrefInPrompt(): boolean {
  return mjVersionSupportsOref(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)
}

/** 官方 Omni Reference：存在有效 --oref 链时与 Draft、`--q 4`、Fast Mode 等不兼容（见 Omni Reference 文档） */
function mjOrefComboLockActive(): boolean {
  return mjSupportsOrefInPrompt() && !!mjExtRefUrlSanitized(mjRefOrefUrl.value)
}

const mjOrefComboLock = computed(() => mjOrefComboLockActive())

function mjAppendAdvancedPromptSuffixes(kind: 'imagine' | 'edits'): string[] {
  const out: string[] = []
  if (kind === 'imagine' && mjParamIw.value > 0 && implyBase64List.value.length > 0) {
    const iw = 0.25 + ((mjParamIw.value - 1) / 99) * 1.75
    out.push(`--iw ${iw.toFixed(2)}`)
  }
  if (mjParamStylize.value > 0) {
    out.push(`--s ${Math.round(Math.min(1000, Math.max(1, mjParamStylize.value)))}`)
  }
  if (mjParamChaos.value > 0) {
    out.push(`--chaos ${Math.round(Math.min(100, Math.max(1, mjParamChaos.value)))}`)
  }
  if (mjParamWeird.value > 0) {
    out.push(`--weird ${Math.round(Math.min(3000, Math.max(1, mjParamWeird.value)))}`)
  }
  if (mjParamStop.value >= 10) {
    out.push(`--stop ${Math.round(Math.min(100, Math.max(10, mjParamStop.value)))}`)
  }
  const q = mjParamQuality.value
  const orefLock = mjOrefComboLockActive()
  if (q === 1) out.push('--q .25')
  else if (q === 2) out.push('--q .5')
  else if (q === 3) out.push('--q 1')
  else if (q === 4 && !orefLock) out.push('--q 2')
  if (mjStyleRaw.value) out.push('--raw')

  if (mjSupportsCrefInPrompt()) {
    const cref = mjExtRefUrlSanitized(mjRefCrefUrl.value)
    if (cref) {
      out.push(`--cref ${cref}`)
      if (mjParamCw.value > 0) {
        out.push(`--cw ${Math.min(100, Math.max(1, Math.round(mjParamCw.value)))}`)
      }
    }
  }
  if (mjSupportsSrefInPrompt()) {
    const sref = mjExtRefUrlSanitized(mjRefSrefUrl.value)
    if (sref) {
      out.push(`--sref ${sref}`)
      if (mjParamSw.value > 0) {
        out.push(`--sw ${Math.min(1000, Math.max(1, Math.round(mjParamSw.value)))}`)
      }
      const sv = Math.round(mjParamSv.value)
      if (
        mjVersionSupportsSvValue(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value, sv)
      ) {
        out.push(`--sv ${sv}`)
      }
    }
  }

  if (mjSupportsOrefInPrompt()) {
    const oref = mjExtRefUrlSanitized(mjRefOrefUrl.value)
    if (oref) {
      out.push(`--oref ${oref}`)
      if (mjParamOw.value > 0) {
        out.push(`--ow ${Math.min(1000, Math.max(1, Math.round(mjParamOw.value)))}`)
      }
    }
  }

  if (mjParamTile.value) out.push('--tile')
  if (
    mjParamDraft.value &&
    mjVersionSupportsDraft(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value) &&
    !mjOrefComboLockActive()
  ) {
    out.push('--draft')
  }
  if (mjStyle.value === 'realistic' && mjRealisticVersion.value === '8') {
    if (mjV8OutputMode.value === 'sd') out.push('--sd')
    else if (mjV8OutputMode.value === 'hd') out.push('--hd')
  }
  const rep = Math.round(mjParamRepeat.value)
  if (rep >= 2 && rep <= 40) out.push(`--repeat ${rep}`)

  return out
}

/**
 * 侧栏已有合法 https 参考链但最终 prompt 未出现 --cref/--sref/--oref 时补上一段（与 {@link mjAppendAdvancedPromptSuffixes} 一致）。
 * 用于防御 v-model/emit 竞态、旧静态资源包等导致的漏拼，避免服务端日志 promptMeta.cref 恒为 false。
 */
function mjRepairMissingExternalRefSuffixes(prompt: string): string {
  let out = prompt
  const addChunk = (frag: string) => {
    if (!frag) return
    if (!out) out = frag
    else out = out.endsWith(' ') ? `${out}${frag}` : `${out} ${frag}`
  }

  if (mjSupportsCrefInPrompt()) {
    const cref = mjExtRefUrlSanitized(mjRefCrefUrl.value)
    if (cref && !/--cref\b/i.test(out)) {
      addChunk(`--cref ${cref}`)
      if (mjParamCw.value > 0 && !/--cw\b/i.test(out)) {
        addChunk(`--cw ${Math.min(100, Math.max(1, Math.round(mjParamCw.value)))}`)
      }
    }
  }
  if (mjSupportsSrefInPrompt()) {
    const sref = mjExtRefUrlSanitized(mjRefSrefUrl.value)
    if (sref && !/--sref\b/i.test(out)) {
      addChunk(`--sref ${sref}`)
      if (mjParamSw.value > 0 && !/--sw\b/i.test(out)) {
        addChunk(`--sw ${Math.min(1000, Math.max(1, Math.round(mjParamSw.value)))}`)
      }
      const sv = Math.round(mjParamSv.value)
      if (
        mjVersionSupportsSvValue(
          mjStyle.value,
          mjRealisticVersion.value,
          mjNijiVersion.value,
          sv
        ) &&
        !/--sv\b/i.test(out)
      ) {
        addChunk(`--sv ${sv}`)
      }
    }
  }

  if (mjSupportsOrefInPrompt()) {
    const oref = mjExtRefUrlSanitized(mjRefOrefUrl.value)
    if (oref && !/--oref\b/i.test(out)) {
      addChunk(`--oref ${oref}`)
      if (mjParamOw.value > 0 && !/--ow\b/i.test(out)) {
        addChunk(`--ow ${Math.min(1000, Math.max(1, Math.round(mjParamOw.value)))}`)
      }
    }
  }

  return out
}

function buildMjPrompt(userMsg: string, kind: 'imagine' | 'edits' = 'imagine'): string {
  const base = userMsg.trim()
  /** 仅自定义：不自动拼 --ar/--v/--niji/--seed/--no，但侧栏「高级参数」仍须写入（cref/sref、--s、垫图 --iw 等） */
  if (mjCustomParamsOnly.value) {
    const parts: string[] = [base]
    for (const x of mjAppendAdvancedPromptSuffixes(kind)) parts.push(x)
    return mjRepairMissingExternalRefSuffixes(parts.filter(Boolean).join(' '))
  }
  const parts: string[] = [base, mjArSuffix.value]
  if (mjStyle.value === 'anime') parts.push(`--niji ${mjNijiVersion.value}`)
  else parts.push(`--v ${mjRealisticVersion.value}`)
  const seedPart = mjSeedSuffix(mjSeed.value)
  if (seedPart) parts.push(seedPart)
  const neg = negativePrompt.value.trim()
  if (neg) parts.push(`--no ${neg.replace(/\s+/g, ' ')}`)
  for (const x of mjAppendAdvancedPromptSuffixes(kind)) {
    parts.push(x)
  }
  return mjRepairMissingExternalRefSuffixes(parts.filter(Boolean).join(' '))
}

function loadMjCustomParamsPref() {
  try {
    const raw = localStorage.getItem(MJ_CUSTOM_PARAMS_LS)
    if (raw === '1') {
      mjCustomParamsOnly.value = true
    } else {
      mjCustomParamsOnly.value = false
      if (raw != null && raw !== '0') localStorage.setItem(MJ_CUSTOM_PARAMS_LS, '0')
    }
  } catch {
    /* ignore */
  }
}

function setMjCustomParamsOnly(v: boolean) {
  mjCustomParamsOnly.value = v
}

/** 显式写入 ref，避免模板内联箭头在部分构建链路上对 ref 赋值不可靠，导致 --cref 未进 prompt */
function setMjRefCrefUrl(v: string) {
  const raw = mjClipExtRefUrlForStorage(String(v ?? ''))
  /** 与侧栏校验一致：优先写入规范化后的 https，解析失败时保留原文便于用户继续编辑 */
  mjRefCrefUrl.value = mjExtRefUrlSanitized(raw) ?? raw
}
function setMjRefSrefUrl(v: string) {
  const raw = mjClipExtRefUrlForStorage(String(v ?? ''))
  mjRefSrefUrl.value = mjExtRefUrlSanitized(raw) ?? raw
}
function setMjRefOrefUrl(v: string) {
  const raw = mjClipExtRefUrlForStorage(String(v ?? ''))
  mjRefOrefUrl.value = mjExtRefUrlSanitized(raw) ?? raw
}
function setMjRefUploading(v: boolean) {
  mjRefUploading.value = !!v
}

function loadMjVersionSeedPrefs() {
  try {
    const v = localStorage.getItem(MJ_VER_LS)
    if (v === '6' || v === '7' || v === '8') mjRealisticVersion.value = v
    const nj = localStorage.getItem(MJ_NIJI_LS)
    if (nj === '6' || nj === '7') mjNijiVersion.value = nj
    const sd = localStorage.getItem(MJ_SEED_LS)
    if (sd != null) mjSeed.value = sd
  } catch {
    /* ignore */
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function mjNum(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 侧栏 v-model 显式写 .value，避免内联 `v => (ref = x)` 在部分构建链路上未按 ref 解包导致状态丢失 */
function setMjParamIw(v: number) {
  mjParamIw.value = clamp(Math.floor(mjNum(v)), 0, 100)
}
function setMjParamStylize(v: number) {
  mjParamStylize.value = clamp(Math.floor(mjNum(v)), 0, 1000)
}
function setMjParamChaos(v: number) {
  mjParamChaos.value = clamp(Math.floor(mjNum(v)), 0, 100)
}
function setMjParamWeird(v: number) {
  mjParamWeird.value = clamp(Math.floor(mjNum(v)), 0, 3000)
}
function setMjParamStop(v: number) {
  mjParamStop.value = clamp(Math.floor(mjNum(v)), 0, 100)
}
function setMjParamQuality(v: number) {
  mjParamQuality.value = clamp(Math.floor(mjNum(v)), 0, 4)
}
function setMjStyleRaw(v: boolean) {
  mjStyleRaw.value = !!v
}
function setMjParamCw(v: number) {
  mjParamCw.value = clamp(Math.floor(mjNum(v)), 0, 100)
}
function setMjParamSw(v: number) {
  mjParamSw.value = clamp(Math.floor(mjNum(v)), 0, 1000)
}
function setMjParamSv(v: number) {
  mjParamSv.value = clamp(Math.floor(mjNum(v)), 0, 7)
}
function setMjParamOw(v: number) {
  mjParamOw.value = clamp(Math.floor(mjNum(v)), 0, 1000)
}
function setMjParamTile(v: boolean) {
  mjParamTile.value = !!v
}
function setMjParamDraft(v: boolean) {
  mjParamDraft.value = !!v
}
function setMjV8OutputMode(v: MjV8OutputMode | string) {
  const x = String(v) as MjV8OutputMode
  if (x === 'sd' || x === 'hd' || x === 'off') mjV8OutputMode.value = x
}
function setMjParamRepeat(v: number) {
  mjParamRepeat.value = clamp(Math.floor(mjNum(v)), 0, 40)
}

/** 本地持久化里曾出现「有 --cw/--sw 权重但无有效 https 链」的组合时，与 mjAppendAdvancedPromptSuffixes 对齐，避免误提示 / 误显示 */
function normalizeMjRefSlidersAgainstStoredUrls(): void {
  if (!mjExtRefUrlSanitized(mjRefCrefUrl.value)) mjParamCw.value = 0
  if (!mjExtRefUrlSanitized(mjRefSrefUrl.value)) {
    mjParamSw.value = 0
    mjParamSv.value = 0
  }
  if (!mjExtRefUrlSanitized(mjRefOrefUrl.value)) mjParamOw.value = 0
}

function loadMjAdvSlidersPrefs() {
  try {
    const raw = localStorage.getItem(MJ_ADV_SLIDERS_LS)
    if (!raw) return
    const o = JSON.parse(raw) as Record<string, unknown>
    if (typeof o.iw === 'number') mjParamIw.value = clamp(Math.floor(o.iw), 0, 100)
    if (typeof o.stylize === 'number') mjParamStylize.value = clamp(Math.floor(o.stylize), 0, 1000)
    if (typeof o.chaos === 'number') mjParamChaos.value = clamp(Math.floor(o.chaos), 0, 100)
    if (typeof o.weird === 'number') mjParamWeird.value = clamp(Math.floor(o.weird), 0, 3000)
    if (typeof o.stop === 'number') mjParamStop.value = clamp(Math.floor(o.stop), 0, 100)
    if (typeof o.quality === 'number') mjParamQuality.value = clamp(Math.floor(o.quality), 0, 4)
    if (typeof o.styleRaw === 'boolean') mjStyleRaw.value = o.styleRaw
    if (typeof o.crefUrl === 'string') mjRefCrefUrl.value = mjClipExtRefUrlForStorage(o.crefUrl)
    if (typeof o.cw === 'number') mjParamCw.value = clamp(Math.floor(o.cw), 0, 100)
    if (typeof o.srefUrl === 'string') mjRefSrefUrl.value = mjClipExtRefUrlForStorage(o.srefUrl)
    if (typeof o.sw === 'number') mjParamSw.value = clamp(Math.floor(o.sw), 0, 1000)
    if (typeof o.sv === 'number') mjParamSv.value = clamp(Math.floor(o.sv), 0, 7)
    if (typeof o.orefUrl === 'string') mjRefOrefUrl.value = mjClipExtRefUrlForStorage(o.orefUrl)
    if (typeof o.ow === 'number') mjParamOw.value = clamp(Math.floor(o.ow), 0, 1000)
    if (typeof o.tile === 'boolean') mjParamTile.value = o.tile
    if (typeof o.draft === 'boolean') mjParamDraft.value = o.draft
    if (o.v8Out === 'sd' || o.v8Out === 'hd' || o.v8Out === 'off') mjV8OutputMode.value = o.v8Out
    if (typeof o.repeat === 'number') mjParamRepeat.value = clamp(Math.floor(o.repeat), 0, 40)
    normalizeMjRefSlidersAgainstStoredUrls()
  } catch {
    /* ignore */
  }
}

function persistMjAdvSlidersPrefs() {
  try {
    localStorage.setItem(
      MJ_ADV_SLIDERS_LS,
      JSON.stringify({
        iw: mjParamIw.value,
        stylize: mjParamStylize.value,
        chaos: mjParamChaos.value,
        weird: mjParamWeird.value,
        stop: mjParamStop.value,
        quality: mjParamQuality.value,
        styleRaw: mjStyleRaw.value,
        crefUrl: mjRefCrefUrl.value,
        cw: mjParamCw.value,
        srefUrl: mjRefSrefUrl.value,
        sw: mjParamSw.value,
        sv: mjParamSv.value,
        orefUrl: mjRefOrefUrl.value,
        ow: mjParamOw.value,
        tile: mjParamTile.value,
        draft: mjParamDraft.value,
        v8Out: mjV8OutputMode.value,
        repeat: mjParamRepeat.value,
      })
    )
  } catch {
    /* ignore */
  }
}

function applyMjSubmitResponse(r: unknown, job: MjJobItem): boolean {
  const parsed = parseMjSubmitBody(r)
  if (!parsed.ok) {
    job.error = mjTranslateKnownDrawingError(parsed.message, t) || t('common.wrong')
    return false
  }
  const mj = parsed.mj
  const tid = extractMjTaskId(mj as { result?: string | number; properties?: unknown })
  // 部分上游把 taskId 放在 data.result 里且解包后丢失 code；只要有 tid 即视为提交成功并进入轮询
  if (tid) {
    job.taskId = tid
    return true
  }
  if (!isMjSubmitAcceptedCode(mj?.code)) {
    const descRaw = mj?.description != null ? String(mj.description).trim() : ''
    const codePart = mj?.code != null ? `submit code=${mj.code}` : ''
    const desc = descRaw || codePart
    job.error = mjTranslateKnownDrawingError(desc, t) || desc || t('common.wrong')
    return false
  }
  job.error =
    mjTranslateKnownDrawingError(mj?.description != null ? String(mj.description) : '', t) ||
    t('drawing.mjNoTaskId')
  return false
}

const filteredMjJobs = computed(() => {
  const q = taskSearchQuery.value.trim().toLowerCase()
  if (!q) return mjJobs.value
  return mjJobs.value.filter(
    j =>
      j.promptLabel.toLowerCase().includes(q) ||
      String(j.taskId).toLowerCase().includes(q) ||
      String(j.serverJobId ?? '').includes(q) ||
      String(j.error || '')
        .toLowerCase()
        .includes(q)
  )
})

function resolveMjParentJob(job: MjJobItem): MjJobItem | undefined {
  const plid = job.parentLocalId
  if (plid != null && Number.isFinite(plid)) {
    const byLid = mjJobs.value.find(j => j.localId === plid)
    if (byLid) return byLid
  }
  const pt = String(job.parentTaskId || '').trim()
  if (!pt) return undefined
  const matches = mjJobs.value.filter(j => String(j.taskId || '').trim() === pt)
  if (!matches.length) return undefined
  if (matches.length === 1) return matches[0]
  return matches.find(j => j.localId !== job.localId) ?? matches[0]
}

function mjParentJumpVisible(job: MjJobItem): boolean {
  return Boolean(
    String(job.parentTaskId || '').trim() ||
    (job.parentLocalId != null && Number.isFinite(job.parentLocalId))
  )
}

async function navigateToMjParentJob(job: MjJobItem) {
  const parent = resolveMjParentJob(job)
  if (!parent) {
    ms.info(t('drawing.mjParentNotFound'))
    return
  }
  const q = taskSearchQuery.value.trim().toLowerCase()
  if (q) {
    const hit =
      parent.promptLabel.toLowerCase().includes(q) ||
      String(parent.taskId).toLowerCase().includes(q) ||
      String(parent.serverJobId ?? '').includes(q) ||
      String(parent.error || '')
        .toLowerCase()
        .includes(q)
    if (!hit) {
      taskSearchQuery.value = ''
      await nextTick()
    }
  }
  await nextTick()
  const el = document.querySelector(`[data-mj-job-local-id="${parent.localId}"]`)
  if (!el || !(el instanceof HTMLElement)) {
    ms.info(t('drawing.mjParentNotFound'))
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (mjParentHighlightTimer) {
    clearTimeout(mjParentHighlightTimer)
    mjParentHighlightTimer = null
  }
  mjParentHighlightLocalId.value = parent.localId
  mjParentHighlightTimer = setTimeout(() => {
    if (mjParentHighlightLocalId.value === parent.localId) mjParentHighlightLocalId.value = null
    mjParentHighlightTimer = null
  }, 2400)
}

const sizeOptions = computed(() => [
  { label: t('chat.square1'), value: '1024x1024' },
  { label: t('chat.illustration'), value: '1024x768' },
  { label: t('chat.wallpaper'), value: '1792x1024' },
  { label: t('chat.media'), value: '1024x1792' },
  { label: t('chat.poster'), value: '1024x1536' },
])

const getMobileClass = computed(() => {
  if (isMobile.value) return ['rounded-none', 'shadow-none']
  return ['rounded-none', 'shadow-md', 'dark:border-gray-900']
})

const getContainerClass = computed(() => {
  return [
    'h-full',
    'transition-[padding]',
    'duration-300',
    { 'pl-[260px]': !isMobile.value && !collapsed.value },
  ]
})

async function loadDrawingModels() {
  modelsLoading.value = true
  try {
    const res = (await fetchDrawingModelsListAPI()) as {
      success?: boolean
      data?: { list: DrawingModel[] }
    }
    if (res.success && res.data?.list?.length) {
      drawingModels.value = res.data.list
      if (!selectedModelKey.value) selectedModelKey.value = res.data.list[0].model
    } else {
      drawingModels.value = []
    }
  } catch {
    drawingModels.value = []
  } finally {
    modelsLoading.value = false
  }
}

async function ensureDrawingSession(m: DrawingModel) {
  const modelConfig = buildModelConfig(m)
  if (drawingSessionGroupId.value) {
    await chatStore.setActiveGroup(drawingSessionGroupId.value)
    const cur = chatStore.activeConfig?.modelInfo?.model
    if (cur !== m.model) {
      await fetchUpdateGroupAPI({
        groupId: drawingSessionGroupId.value,
        config: JSON.stringify(modelConfig),
      })
      await chatStore.queryMyGroup()
      await chatStore.setActiveGroup(drawingSessionGroupId.value)
    }
    return
  }
  await chatStore.addNewChatGroup(0, modelConfig)
  drawingSessionGroupId.value = Number(chatStore.active)
}

function stopPoll(taskId: string) {
  const tmr = pollTimers.get(taskId)
  if (tmr) {
    clearInterval(tmr)
    pollTimers.delete(taskId)
  }
}

/**
 * 解析 mjJobs 中当前任务行。userInfo 异步补全等会触发整表替换，轮询闭包里的 job 可能已不是列表里的引用，
 * 直接改旧对象会导致界面卡在「提交中」——必须写到当前数组里的对象上。
 */
function resolveMjJobRef(job: MjJobItem): MjJobItem | undefined {
  return mjJobs.value.find(j => j.localId === job.localId)
}

function mergeMjJobWithRemote(local: MjJobItem, remote: MjJobItem): MjJobItem {
  const lu = collectMjImageUrls(local.task).length
  const ru = collectMjImageUrls(remote.task).length
  const task = lu > ru ? local.task : ru > lu ? remote.task : (local.task ?? remote.task)
  const loading = local.loading && remote.loading
  const deductCharged = remote.deductCharged ?? local.deductCharged
  const chargeMult = remote.chargeMult ?? local.chargeMult
  const deductTypeSnapshot = remote.deductTypeSnapshot ?? local.deductTypeSnapshot
  const rt = String(remote.parentTaskId || '').trim()
  const lt = String(local.parentTaskId || '').trim()
  const parentTaskId = rt || lt || undefined
  const parentLocalId =
    (remote.parentLocalId != null && Number.isFinite(remote.parentLocalId)
      ? remote.parentLocalId
      : undefined) ??
    (local.parentLocalId != null && Number.isFinite(local.parentLocalId)
      ? local.parentLocalId
      : undefined)
  return {
    ...remote,
    ...local,
    serverJobId: remote.serverJobId ?? local.serverJobId,
    task,
    loading,
    error: local.error ?? remote.error,
    deductCharged,
    chargeMult,
    deductTypeSnapshot,
    parentTaskId,
    parentLocalId,
    queuedAtMs: local.queuedAtMs ?? remote.queuedAtMs,
  }
}

function startPollTask(taskId: string, job: MjJobItem) {
  stopPoll(taskId)
  let n = 0
  let failStreak = 0
  const tick = async () => {
    const live = resolveMjJobRef(job)
    if (!live) {
      stopPoll(taskId)
      return
    }
    const modelRow =
      (live.modelKey && drawingModels.value.find(x => x.model === live.modelKey)) ||
      selectedModel.value
    const mode = mjModeForFollowUp(live)
    if (!modelRow) {
      stopPoll(taskId)
      live.loading = false
      live.error = live.error || t('drawing.needModel')
      return
    }
    n++
    if (n > mjTaskPollMaxIterations(mode)) {
      stopPoll(taskId)
      live.loading = false
      live.error = live.error || t('drawing.mjClientPollTimeout')
      return
    }
    try {
      const r = await fetchMjTask(taskId, modelRow.model, mode)
      const nestErr = nestResultErrorMessage(r)
      if (nestErr) {
        stopPoll(taskId)
        live.loading = false
        live.error = mjTranslateKnownDrawingError(nestErr, t) || nestErr
        return
      }
      const task = parseMjTaskBody(r)
      if (!task) {
        failStreak++
        if (failStreak >= 8) {
          stopPoll(taskId)
          live.loading = false
          live.error = live.error || t('drawing.mjPollFail')
        }
        return
      }
      failStreak = 0
      live.task = task
      const outcome = mjTaskPollOutcome(task)
      if (outcome.phase === 'running') return

      if (outcome.phase === 'done_ok' && collectMjImageUrls(task).length === 0) {
        /** 上游已标完成但图链尚未返回；若此时停轮询会出现「完成却空白」直到手动刷新 */
        return
      }

      stopPoll(taskId)
      live.loading = false
      if (outcome.phase === 'done_fail') {
        const raw = outcome.message || 'FAILURE'
        const hintKey = mjTaskFailureHintKeyFromTask(task) ?? mjTaskFailureHintKey(raw)
        const queueKey = mjKnownDrawingErrorI18nKey(raw)
        live.error = hintKey ? t(hintKey) : queueKey ? t(queueKey) : raw
      }
      await authStore.getUserBalance()
    } catch {
      const again = resolveMjJobRef(job)
      failStreak++
      if (failStreak >= 8) {
        stopPoll(taskId)
        if (again) {
          again.loading = false
          again.error = again.error || t('drawing.mjPollFail')
        }
      }
    }
  }
  void tick()
  const id = setInterval(() => void tick(), MJ_TASK_POLL_INTERVAL_MS)
  pollTimers.set(taskId, id)
}

function resumePollingRestoredJobs() {
  for (const job of mjJobs.value) {
    if (!job.loading) continue
    if (!job.taskId) {
      job.loading = false
      job.error = job.error || t('drawing.mjInterruptedRefresh')
      continue
    }
    const modelRow =
      (job.modelKey && drawingModels.value.find(x => x.model === job.modelKey)) ||
      selectedModel.value
    if (!modelRow) {
      job.loading = false
      job.error = job.error || t('drawing.mjRestoreNoModel')
      continue
    }
    startPollTask(job.taskId, job)
  }
}

onUnmounted(() => {
  if (mjDrawElapsedTimer) {
    clearInterval(mjDrawElapsedTimer)
    mjDrawElapsedTimer = null
  }
  if (persistMjJobsReady.value) void persistMjJobsHybrid()
  pollTimers.forEach(t => clearInterval(t))
  pollTimers.clear()
  if (mjParentHighlightTimer) {
    clearTimeout(mjParentHighlightTimer)
    mjParentHighlightTimer = null
  }
})

async function handleMjImagine() {
  const m = selectedModel.value
  if (!m) return
  const msg = promptText.value.trim()
  if (!msg) {
    ms.warning(t('drawing.needPrompt'))
    return
  }
  if (mjRefUploading.value) {
    ms.warning(t('drawing.mjRefWaitUploadWhenGenerate'))
    return
  }
  if (mjParamCw.value > 0 && !mjExtRefUrlSanitized(mjRefCrefUrl.value)) {
    ms.warning(t('drawing.mjRefNeedUrlHint'))
    return
  }
  if ((mjParamSw.value > 0 || mjParamSv.value > 0) && !mjExtRefUrlSanitized(mjRefSrefUrl.value)) {
    ms.warning(t('drawing.mjRefNeedUrlHint'))
    return
  }
  if (mjParamOw.value > 0 && !mjExtRefUrlSanitized(mjRefOrefUrl.value)) {
    ms.warning(t('drawing.mjRefNeedUrlHint'))
    return
  }
  if (studioTab.value === 'i2i' && implyBase64List.value.length < 1) {
    ms.warning(t('drawing.i2iNeedImage'))
    return
  }
  await nextTick()
  await nextTick()
  const fullPrompt = buildMjPrompt(msg)
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: msg,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjImagine({
      model: m.model,
      mjMode: mjMode.value,
      prompt: fullPrompt,
      base64Array: implyBase64List.value.length ? implyBase64List.value : undefined,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'prompt', fullPrompt })
    startPollTask(job.taskId, job)
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

async function handleMjDescribe() {
  const m = selectedModel.value
  if (!m) return
  if (!describeBase64.value) {
    ms.warning(t('drawing.mjDescribeImage'))
    return
  }
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: 'Describe',
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjDescribe({
      model: m.model,
      mjMode: mjMode.value,
      base64: describeBase64.value,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 1 })
    startPollTask(job.taskId, job)
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

async function handleMjShorten() {
  const m = selectedModel.value
  if (!m) return
  const msg = promptText.value.trim()
  if (!msg) {
    ms.warning(t('drawing.needPrompt'))
    return
  }
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: msg,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjShorten({
      model: m.model,
      mjMode: mjMode.value,
      prompt: msg,
      botType: 'MID_JOURNEY',
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'prompt', fullPrompt: msg })
    startPollTask(job.taskId, job)
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

async function onBlendFiles(e: Event) {
  const inp = e.target as HTMLInputElement
  const files = inp.files
  if (!files?.length) return
  try {
    const list: string[] = []
    for (let i = 0; i < files.length; i++) {
      list.push(await fileToMjBlendDataUrl(files[i]))
    }
    blendBase64List.value = list
  } catch {
    ms.error(t('drawing.mjFileReadFail'))
  } finally {
    inp.value = ''
  }
}

async function handleMjBlend() {
  const m = selectedModel.value
  if (!m) return
  if (blendBase64List.value.length < 2) {
    ms.warning(t('drawing.mjNeedBlendTwo'))
    return
  }
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: `Blend (${blendBase64List.value.length})`,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjBlend({
      model: m.model,
      mjMode: mjMode.value,
      base64Array: blendBase64List.value,
      dimensions: blendDimensions.value,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 4 })
    startPollTask(job.taskId, job)
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

function fillEditsUrlFromLatestJob() {
  for (const job of mjJobs.value) {
    const urls = mjJobImageUrls(job)
    if (urls.length) {
      editsImageUrl.value = urls[0]
      editsSourceLocalId.value = job.localId
      return
    }
  }
  editsSourceLocalId.value = null
  ms.warning(t('drawing.mjEditsNoImageToFill'))
}

/** 用于判断「侧栏 URL 是否仍来自某张任务卡片」以决定是否挂父任务 */
function mjNormalizeEditsUrlKey(u: string): string {
  const s = u.trim()
  if (!s) return ''
  return s.split('#')[0].trim().toLowerCase().replace(/\/+$/, '')
}

function mjEditsUrlsMatch(a: string, b: string): boolean {
  return mjNormalizeEditsUrlKey(a) === mjNormalizeEditsUrlKey(b)
}

/** 从指定任务填入待编辑图 URL，切换至 Edits 并记录来源以便提交时挂父任务 */
function fillEditsUrlFromJob(job: MjJobItem, imageUrl?: string) {
  const live = resolveMjJobRef(job) ?? job
  const urls = mjJobImageUrls(live)
  if (!urls.length) {
    ms.warning(t('drawing.mjEditsNoImageToFill'))
    return
  }
  const pick =
    (imageUrl && urls.find(u => mjEditsUrlsMatch(u, imageUrl))) ||
    (imageUrl && urls.find(u => u.trim() === imageUrl.trim())) ||
    urls[0]
  editsImageUrl.value = pick
  editsSourceLocalId.value = live.localId
  studioTab.value = 'edits'
  ms.info(t('drawing.mjEditsFilledFromCard'))
}

function resolveMjEditsSourceJobForSubmit(currentUrl: string): MjJobItem | undefined {
  const img = currentUrl.trim()
  if (!img) return undefined
  const lid = editsSourceLocalId.value
  if (lid != null) {
    const j = mjJobs.value.find(x => x.localId === lid)
    if (j && mjJobImageUrls(j).some(u => mjEditsUrlsMatch(u, img))) return resolveMjJobRef(j) ?? j
  }
  for (const j of mjJobs.value) {
    if (mjJobImageUrls(j).some(u => mjEditsUrlsMatch(u, img))) return resolveMjJobRef(j) ?? j
  }
  return undefined
}

watch(editsImageUrl, v => {
  const lid = editsSourceLocalId.value
  if (lid == null) return
  const j = mjJobs.value.find(x => x.localId === lid)
  const cur = v.trim()
  if (!j || !cur) {
    editsSourceLocalId.value = null
    return
  }
  if (!mjJobImageUrls(j).some(u => mjEditsUrlsMatch(u, cur))) editsSourceLocalId.value = null
})

async function onEditsMaskFile(e: Event) {
  const inp = e.target as HTMLInputElement
  const file = inp.files?.[0]
  if (!file) return
  try {
    editsMaskBase64.value = await fileToMjMaskDataUrl(file)
  } catch {
    ms.error(t('drawing.mjFileReadFail'))
  } finally {
    inp.value = ''
  }
}

async function handleMjEdits() {
  const m = selectedModel.value
  if (!m) return
  const msg = promptText.value.trim()
  if (!msg) {
    ms.warning(t('drawing.needPrompt'))
    return
  }
  const img = editsImageUrl.value.trim()
  if (!img) {
    ms.warning(t('drawing.mjEditsNeedUrl'))
    return
  }
  if (mjRefUploading.value) {
    ms.warning(t('drawing.mjRefWaitUploadWhenGenerate'))
    return
  }
  if (mjParamCw.value > 0 && !mjExtRefUrlSanitized(mjRefCrefUrl.value)) {
    ms.warning(t('drawing.mjRefNeedUrlHint'))
    return
  }
  if ((mjParamSw.value > 0 || mjParamSv.value > 0) && !mjExtRefUrlSanitized(mjRefSrefUrl.value)) {
    ms.warning(t('drawing.mjRefNeedUrlHint'))
    return
  }
  if (mjParamOw.value > 0 && !mjExtRefUrlSanitized(mjRefOrefUrl.value)) {
    ms.warning(t('drawing.mjRefNeedUrlHint'))
    return
  }
  await nextTick()
  await nextTick()
  const fullPrompt = buildMjPrompt(msg, 'edits')
  const editsSrc = resolveMjEditsSourceJobForSubmit(img)
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: msg,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
    ...mjParentFieldsFromSource(editsSrc),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjEdits({
      model: m.model,
      mjMode: mjMode.value,
      prompt: fullPrompt,
      image: img,
      maskBase64: editsMaskBase64.value.trim() || undefined,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 1 })
    startPollTask(job.taskId, job)
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

function extractMjTaskListArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    const cands = [p.list, p.data, p.records, p.tasks, p.rows]
    for (const c of cands) {
      if (Array.isArray(c)) return c as Record<string, unknown>[]
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        const inner = (c as Record<string, unknown>).list
        if (Array.isArray(inner)) return inner as Record<string, unknown>[]
      }
    }
  }
  return []
}

function pickMjListRowTaskId(row: Record<string, unknown>): string {
  return String(row.id ?? row.taskId ?? row.task_id ?? '').trim()
}

function rowToMjTaskRecord(row: Record<string, unknown>): Record<string, unknown> {
  if (row.status != null || row.imageUrl != null || row.image_url != null || row.progress != null)
    return row
  const nested = row.task
  if (nested && typeof nested === 'object' && !Array.isArray(nested))
    return nested as Record<string, unknown>
  return row
}

async function syncMjTasksBatch() {
  const m = selectedModel.value
  if (!m) {
    ms.warning(t('drawing.needModel'))
    return
  }
  const ids = [
    ...new Set(mjJobs.value.map(j => String(j.taskId || '').trim()).filter(Boolean)),
  ] as string[]
  if (!ids.length) {
    ms.warning(t('drawing.mjBatchSyncNoIds'))
    return
  }
  if (mjBatchSyncing.value) return
  mjBatchSyncing.value = true
  try {
    const slice = ids.slice(0, 50)
    const res = await listMjTasksByIds<unknown>({
      model: m.model,
      mjMode: mjMode.value,
      ids: slice,
    })
    const payload = (res as { data?: unknown })?.data ?? res
    const rows = extractMjTaskListArray(payload)
    let n = 0
    for (const row of rows) {
      const tid = pickMjListRowTaskId(row)
      if (!tid) continue
      const taskRec = rowToMjTaskRecord(row)
      const job = mjJobs.value.find(j => j.taskId === tid)
      if (!job) continue
      job.task = taskRec
      n++
    }
    if (n) ms.success(t('drawing.mjBatchSyncOk', { n }))
    else ms.info(t('drawing.mjBatchSyncEmpty'))
  } catch (e: unknown) {
    ms.error((e as Error)?.message || t('drawing.mjBatchSyncFail'))
  } finally {
    mjBatchSyncing.value = false
  }
}

async function handleMjChangeSubmit() {
  if (!authStore.isLogin) {
    ms.warning(t('drawing.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const m = selectedModel.value
  if (!m) return
  await ensureDrawingSession(m)
  const tid = mjChangeTaskId.value.trim()
  if (!tid) {
    ms.warning(t('drawing.mjChangeNeedTaskId'))
    return
  }
  const srcChange = mjJobs.value.find(j => j.taskId === tid)
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: `change ${mjChangeAction.value}${mjChangeAction.value === 'REGENERATE' ? '' : ` #${mjChangeIndex.value}`}`,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
    ...mjParentFieldsFromSource(srcChange),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const idx =
      mjChangeAction.value === 'REGENERATE' || mjChangeAction.value === 'REROLL'
        ? undefined
        : Math.min(4, Math.max(1, Math.floor(mjChangeIndex.value) || 1))
    const r = await submitMjChange({
      model: m.model,
      mjMode: mjMode.value,
      taskId: tid,
      action: mjChangeAction.value,
      index: idx,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 1 })
    startPollTask(job.taskId, job)
    await authStore.getUserBalance()
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

function fillMjChangeTaskFromLatest() {
  const j = mjJobs.value.find(x => String(x.taskId || '').trim() && !x.loading)
  if (j?.taskId) {
    mjChangeTaskId.value = j.taskId
    return
  }
  ms.warning(t('drawing.mjChangeNoTask'))
}

/** simple-change 内容常为「taskId + 空格 + 操作码」，据此反查来源任务 */
function resolveMjSourceJobFromSimpleChangeContent(content: string): MjJobItem | undefined {
  const s = content.trim()
  if (!s) return undefined
  for (const j of mjJobs.value) {
    const tid = String(j.taskId || '').trim()
    if (!tid) continue
    if (s.startsWith(tid) && (s.length === tid.length || /\s/.test(s.charAt(tid.length)))) return j
  }
  const first = s.split(/\s+/)[0]?.trim()
  if (first) return mjJobs.value.find(j => j.taskId === first)
  return undefined
}

async function handleMjSimpleChangeSubmit() {
  if (!authStore.isLogin) {
    ms.warning(t('drawing.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const m = selectedModel.value
  if (!m) return
  await ensureDrawingSession(m)
  const content = mjSimpleChangeContent.value.trim()
  if (!content) {
    ms.warning(t('drawing.mjSimpleChangeNeedContent'))
    return
  }
  const srcSimple = resolveMjSourceJobFromSimpleChangeContent(content)
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel: `simple-change`,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
    ...mjParentFieldsFromSource(srcSimple),
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjSimpleChange({
      model: m.model,
      mjMode: mjMode.value,
      content,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 1 })
    startPollTask(job.taskId, job)
    await authStore.getUserBalance()
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

async function onMjButtonClick(
  taskId: string,
  customId: string,
  sourceJob?: MjJobItem,
  actionBtn?: MjFollowBtn
) {
  const m = selectedModel.value
  if (!m) return
  const btn =
    actionBtn ??
    (sourceJob?.task
      ? (mjButtons(sourceJob.task).find(b => b.customId === customId) ?? null)
      : null)
  const block =
    mjMiscButtonPolicyBlockReason(btn) ?? mjMiscPolicyBlockFromProbeText(String(customId || ''))
  if (block) {
    openMjMiscPolicyModal(block)
    return
  }
  const q = btn ? mjUvQuadrantLabel(btn.label) : ''
  const promptLabel = buildMjFollowUpPromptLabel(
    sourceJob,
    {
      btn,
      customId,
      quadrantText: q,
      regenerateLabel: t('drawing.mjRegenerate'),
    },
    (key, params) => t(key, params)
  )
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
    queuedAtMs: Date.now(),
    ...mjParentFieldsFromSource(sourceJob),
  }
  attachMjJobModelMeta(job, m, { mjMode: mjModeForFollowUp(sourceJob) })
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjAction({
      model: m.model,
      mjMode: mjModeForFollowUp(sourceJob),
      taskId,
      customId,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 1 })
    startPollTask(job.taskId, job)
    await authStore.getUserBalance()
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

async function onImagineFiles(e: Event) {
  const inp = e.target as HTMLInputElement
  const files = inp.files
  if (!files?.length) return
  try {
    const list: string[] = []
    for (let i = 0; i < files.length; i++) {
      list.push(await fileToMjDataUrl(files[i]))
    }
    implyBase64List.value = list
  } catch {
    ms.error(t('drawing.mjFileReadFail'))
  } finally {
    inp.value = ''
  }
}

async function onDescribeFile(e: Event) {
  const inp = e.target as HTMLInputElement
  const file = inp.files?.[0]
  if (!file) return
  try {
    describeBase64.value = await fileToMjDataUrl(file)
  } catch {
    ms.error(t('drawing.mjFileReadFail'))
  } finally {
    inp.value = ''
  }
}

function removeImagineRef(ix: number) {
  implyBase64List.value.splice(ix, 1)
}

function clearImagineRefs() {
  implyBase64List.value = []
}

function removeBlendRef(ix: number) {
  blendBase64List.value.splice(ix, 1)
}

function clearBlendRefs() {
  blendBase64List.value = []
}

function removeDescribeUpload() {
  describeBase64.value = ''
}

function removeEditsMaskUpload() {
  editsMaskBase64.value = ''
}

async function handleMjToolSubmit() {
  if (!authStore.isLogin) {
    ms.warning(t('drawing.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const m = selectedModel.value
  if (!m) {
    ms.warning(t('drawing.needModel'))
    return
  }
  if (mjSubmitting.value) return
  mjSubmitting.value = true
  try {
    await ensureDrawingSession(m)
    if (studioTab.value === 't2i' || studioTab.value === 'i2i') await handleMjImagine()
    else if (studioTab.value === 'spell') {
      if (spellMode.value === 'describe') await handleMjDescribe()
      else await handleMjShorten()
    } else if (studioTab.value === 'blend') await handleMjBlend()
    else if (studioTab.value === 'edits') await handleMjEdits()
  } finally {
    mjSubmitting.value = false
  }
}

async function handleGenericGenerate() {
  if (!authStore.isLogin) {
    ms.warning(t('drawing.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const m = selectedModel.value
  if (!m) {
    ms.warning(t('drawing.needModel'))
    return
  }
  const msg = promptText.value.trim()
  if (!msg) {
    ms.warning(t('drawing.needPrompt'))
    return
  }
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试')
    return
  }

  await ensureDrawingSession(m)

  const useModelName = m.modelName
  const useModelType = m.keyType
  const useModelAvatar = m.modelAvatar || ''
  const useModel = m.model
  const groupId = Number(chatStore.active)
  if (!groupId) {
    ms.error(t('common.wrong'))
    return
  }

  addGroupChat({
    content: msg,
    model: useModel,
    modelName: useModelName,
    modelType: useModelType,
    role: 'user',
    fileUrl: '',
    imageUrl: '',
  })

  addGroupChat({
    content: '',
    model: useModel,
    loading: true,
    modelName: useModelName,
    modelType: useModelType,
    role: 'assistant',
    error: false,
    status: 1,
    fileUrl: '',
    modelAvatar: useModelAvatar,
  })

  const item: ResultItem = {
    id: Date.now(),
    prompt: msg,
    text: '',
    loading: true,
  }
  results.value.unshift(item)

  chatStore.setStreamIn(true)
  useGlobalStore.updateIsChatIn(true)
  controller.value = new AbortController()

  const options = {
    groupId,
    fileParsing: '',
    usingNetwork: false,
    usingDeepThinking: false,
    usingMcpTool: false,
  }

  let displayedText = ''
  const assistantIdx = chatStore.chatList.length - 1

  try {
    await fetchChatAPIProcess({
      model: useModel,
      modelName: useModelName,
      modelType: useModelType,
      prompt: msg,
      imageUrl: '',
      fileUrl: '',
      appId: 0,
      modelAvatar: useModelAvatar,
      options,
      signal: controller.value.signal,
      extraParam: { size: extraSize.value },
      usingPluginId: 0,
      onDownloadProgress: ({ event }) => {
        const responseText = (event?.target as any)?.responseText || ''
        const lines = responseText.split('\n').filter((line: string) => line.trim())
        lines.forEach((line: string) => {
          try {
            const jsonObj = JSON.parse(line)
            if (jsonObj.userBalance) authStore.updateUserBalance(jsonObj.userBalance)
            if (jsonObj.content?.[0]?.text) {
              const newText = String(jsonObj.content[0].text)
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
              displayedText += newText
              if (assistantIdx >= 0) {
                updateGroupChatSome(assistantIdx, {
                  content: displayedText,
                  loading: true,
                })
              }
              const cur = results.value.find(r => r.id === item.id)
              if (cur) cur.text = displayedText
            }
          } catch {
            /* ignore */
          }
        })
      },
    })
  } catch (error: unknown) {
    const err = error as { message?: string }
    item.error = err?.message || String(error)
    ms.error(t('common.wrong'))
  } finally {
    chatStore.setStreamIn(false)
    useGlobalStore.updateIsChatIn(false)
    if (assistantIdx >= 0) updateGroupChatSome(assistantIdx, { loading: false })
    item.loading = false
    item.text = displayedText
    await chatStore.queryMyGroup()
    controller.value = null
  }
}

function handleMainGenerate() {
  if (isMjModel.value) return handleMjToolSubmit()
  return handleGenericGenerate()
}

const isModelInherited = computed(() => Number(authStore.globalConfig?.isModelInherited) === 1)

async function createNewChatGroup() {
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试')
    return
  }
  chatStore.setStreamIn(false)
  try {
    const m = selectedModel.value
    if (m) {
      await chatStore.addNewChatGroup(0, buildModelConfig(m))
    } else {
      const { modelInfo } = chatStore.activeConfig
      if (modelInfo && isModelInherited.value && chatStore.activeGroupAppId === 0) {
        await chatStore.addNewChatGroup(0, { modelInfo })
      } else {
        await chatStore.addNewChatGroup()
      }
    }
    chatStore.setUsingPlugin(null)
    drawingSessionGroupId.value = Number(chatStore.active)
    if (isMobile.value) appStore.setSiderCollapsed(true)
  } catch {}
}

watch(isLogin, async (newVal, oldVal) => {
  if (newVal && !oldVal) {
    await chatStore.queryMyGroup()
    await loadDrawingModels()
    if (persistMjJobsReady.value && authStore.isLogin) {
      await loadMjJobsFromApi()
      await nextTick()
      resumePollingRestoredJobs()
    }
  }
})

watch(mjCustomParamsOnly, v => {
  try {
    localStorage.setItem(MJ_CUSTOM_PARAMS_LS, v ? '1' : '0')
  } catch {
    /* ignore */
  }
})

watch(mjRealisticVersion, v => {
  try {
    localStorage.setItem(MJ_VER_LS, v)
  } catch {
    /* ignore */
  }
  if (v !== '8') mjV8OutputMode.value = 'off'
})

watch(mjNijiVersion, v => {
  try {
    localStorage.setItem(MJ_NIJI_LS, v)
  } catch {
    /* ignore */
  }
})

/** 切换模型版本时清空当前版本不支持的参考图与权重，避免 prompt 仍带无效 --cref/--oref */
function clearMjRefParamsForUnsupportedVersion() {
  if (!mjVersionSupportsCref(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)) {
    mjRefCrefUrl.value = ''
    mjParamCw.value = 0
  }
  if (!mjVersionSupportsSref(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)) {
    mjRefSrefUrl.value = ''
    mjParamSw.value = 0
    mjParamSv.value = 0
  }
  if (!mjVersionSupportsOref(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)) {
    mjRefOrefUrl.value = ''
    mjParamOw.value = 0
  }
  if (!mjVersionSupportsDraft(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value)) {
    mjParamDraft.value = false
  }
  const sv = Math.round(mjParamSv.value)
  if (
    sv > 0 &&
    !mjVersionSupportsSvValue(mjStyle.value, mjRealisticVersion.value, mjNijiVersion.value, sv)
  ) {
    mjParamSv.value = 0
  }
}

watch([mjStyle, mjRealisticVersion, mjNijiVersion], clearMjRefParamsForUnsupportedVersion)

/** 官方：Omni 与 Draft、`--q 4`、Fast/Turbo 不兼容 → 自动纠正侧栏状态，避免无效提交 */
watch(
  mjOrefComboLock,
  active => {
    if (!active) return
    if (mjParamDraft.value) mjParamDraft.value = false
    if (mjParamQuality.value === 4) mjParamQuality.value = 3
    if (mjMode.value === 'fast' || mjMode.value === 'turbo') mjMode.value = 'relax'
  },
  { flush: 'sync' }
)

watch(mjSeed, v => {
  try {
    localStorage.setItem(MJ_SEED_LS, v)
  } catch {
    /* ignore */
  }
})

watch(drawingSessionGroupId, v => {
  try {
    if (v != null && v > 0) sessionStorage.setItem(STORAGE_KEY_DRAWING_BIND_GROUP, String(v))
    else sessionStorage.removeItem(STORAGE_KEY_DRAWING_BIND_GROUP)
  } catch {
    /* ignore */
  }
})

onMounted(async () => {
  loadMjCustomParamsPref()
  loadMjVersionSeedPrefs()
  loadMjAdvSlidersPrefs()
  clearMjRefParamsForUnsupportedVersion()
  await loadDrawingModels()
  await chatStore.queryMyGroup()
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_DRAWING_BIND_GROUP)
    if (raw) {
      const bid = Number(raw)
      if (!Number.isNaN(bid) && bid > 0) {
        const exists = chatStore.groupList.some(g => Number(g.uuid) === bid)
        if (exists) drawingSessionGroupId.value = bid
        else sessionStorage.removeItem(STORAGE_KEY_DRAWING_BIND_GROUP)
      }
    }
  } catch {
    /* ignore */
  }
  if (authStore.isLogin) await loadMjJobsFromApi()
  else {
    const restored = loadMjJobsFromStorage()
    if (restored.length) mjJobs.value = restored
  }
  persistMjJobsReady.value = true
  await nextTick()
  resumePollingRestoredJobs()
})

watchDebounced(mjJobs, () => void persistMjJobsHybrid(), { deep: true, debounce: 900 })

watch(
  [
    mjParamIw,
    mjParamStylize,
    mjParamChaos,
    mjParamWeird,
    mjParamStop,
    mjParamQuality,
    mjStyleRaw,
    mjRefCrefUrl,
    mjParamCw,
    mjRefSrefUrl,
    mjParamSw,
    mjParamSv,
    mjRefOrefUrl,
    mjParamOw,
    mjParamTile,
    mjParamDraft,
    mjV8OutputMode,
    mjParamRepeat,
  ],
  () => persistMjAdvSlidersPrefs()
)

watch(
  () => authStore.userInfo?.id,
  async (id, prevId) => {
    if (!persistMjJobsReady.value) return
    /**
     * userInfo 异步从 undefined 补全为数字时，若再整表 replace 会与正在轮询的 job 引用脱节。
     * 首次补全跳过；登出(prev 有值→无)、换账号(两值均为数字且不等)仍刷新列表。
     */
    const hydrateFirst = prevId === undefined && id !== undefined
    if (hydrateFirst) return

    if (prevId != null && id != null && prevId !== id) {
      drawingSessionGroupId.value = null
    }

    if (authStore.isLogin) await loadMjJobsFromApi()
    else {
      mjJobs.value = loadMjJobsFromStorage()
    }
    await nextTick()
    resumePollingRestoredJobs()
  }
)

provide('createNewChatGroup', createNewChatGroup)

const loginDialog = computed(() => authStore.loginDialog)
const badWordsDialog = computed(() => useGlobalStore.BadWordsDialog)
const settingsDialog = computed(() => useGlobalStore.settingsDialog)
const mobileSettingsDialog = computed(() => useGlobalStore.mobileSettingsDialog)

const mjButtons = (task: Record<string, unknown> | undefined) => {
  if (!task) return []
  const pr = task.properties as Record<string, unknown> | undefined
  const a = task.buttons as MjFollowBtn[] | undefined
  const b = pr?.buttons as MjFollowBtn[] | undefined
  const out: MjFollowBtn[] = []
  const seen = new Set<string>()
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue
    for (const x of list) {
      if (!x || typeof x !== 'object') continue
      const btn = x as MjFollowBtn
      const cid = String(btn.customId || '').trim()
      const key = cid || `${String(btn.label || '')}\t${String(btn.emoji || '')}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(btn)
    }
  }
  return out
}

/** U1–U4 / V1–V4 与四宫格对应（Midjourney 约定） */
function mjUvQuadrantLabel(label: string): string {
  const m = /^[UV]([1-4])$/i.exec(String(label).trim())
  if (!m) return ''
  const keys = ['mjQuadTL', 'mjQuadTR', 'mjQuadBL', 'mjQuadBR'] as const
  const idx = Number(m[1]) - 1
  return idx >= 0 && idx < 4 ? t(`drawing.${keys[idx]}`) : ''
}

function mjHasUvNumberedButtons(task: Record<string, unknown> | undefined): boolean {
  return mjButtons(task).some(b => /^[UV][1-4]$/i.test(String(b.label || '').trim()))
}

/** 将上游按钮分组：放大 U、微调 V、其余（重绘图标等） */
function mjButtonSegmentGroups(
  task: Record<string, unknown> | undefined
): Array<{ type: 'upscale' | 'variation' | 'misc'; items: MjFollowBtn[] }> {
  const btns = mjButtons(task)
  const out: Array<{ type: 'upscale' | 'variation' | 'misc'; items: MjFollowBtn[] }> = []
  for (const btn of btns) {
    const L = String(btn.label || '').trim()
    let seg: 'upscale' | 'variation' | 'misc'
    if (/^U[1-4]$/i.test(L)) seg = 'upscale'
    else if (/^V[1-4]$/i.test(L)) seg = 'variation'
    else seg = 'misc'

    const last = out[out.length - 1]
    if (last && last.type === seg) last.items.push(btn)
    else out.push({ type: seg, items: [btn] })
  }
  return out
}

/** 刷新 / Reroll 类按钮（与 U/V 编号按钮区分） */
function mjButtonIsRegenerate(btn: MjFollowBtn): boolean {
  const L = String(btn.label || '').trim()
  if (/^[UV][1-4]$/i.test(L)) return false
  const low = L.toLowerCase()
  const em = String(btn.emoji || '')
  if (/reroll|regenerate|\bre\b|重新生成|重新绘制/.test(low)) return true
  const refreshRe = /[\u{1F504}\u21BB]|🔄|↻|🔁|⟳/u
  if (refreshRe.test(em)) return true
  if (!em && refreshRe.test(L)) return true
  return false
}

function onMjFollowUpSelect(ev: Event, taskId: string) {
  const el = ev.target as HTMLSelectElement
  const v = el.value
  if (!v) return
  const src = mjJobs.value.find(j => String(j.taskId) === taskId)
  const btn = src?.task ? mjButtons(src.task).find(b => b.customId === v) : undefined
  void onMjButtonClick(taskId, v, src, btn)
  el.value = ''
}

function mjMiscHintText(btn: MjFollowBtn): string {
  const key = mjMiscButtonHintKey(btn)
  return key ? t(key) : ''
}

function mjMiscGroupIntroText(group: MjMiscGroup): string {
  const k = mjMiscGroupIntroKey(group)
  return k ? t(k) : ''
}

/** misc 按钮主文案：UV 编号保持原样，其余走上游美化 */
function mjMiscBtnDisplayPrimary(btn: MjFollowBtn): string {
  const raw = String(btn.label || '').trim()
  if (mjUvQuadrantLabel(btn.label)) return raw
  const pretty = formatMjUpstreamButtonLabel(btn.label)
  return (pretty || raw || String(btn.emoji || '')).trim()
}

function mjMiscBucketBtnWrapClass(group: MjMiscGroup): string {
  return group === 'pan' ? 'grid grid-cols-4 gap-1.5' : 'flex flex-col gap-2'
}

function mjMiscBucketBtnClass(group: MjMiscGroup): string {
  const common =
    'btn btn-xs inline-flex min-w-0 flex-col gap-1 border-[var(--border-default)] bg-[var(--surface-muted)] normal-case text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
  if (group === 'pan') {
    return `${common} min-h-[2.5rem] items-center justify-center px-1.5 py-1 text-center text-[11px] leading-tight`
  }
  return `${common} h-auto min-h-0 w-full items-start justify-start px-2.5 py-1.5 text-left text-[10px] leading-snug sm:text-[11px]`
}

function mjMiscOptionLabel(btn: MjFollowBtn): string {
  const raw = String(btn.label || '').trim()
  const text = mjUvQuadrantLabel(btn.label)
    ? raw
    : (formatMjUpstreamButtonLabel(btn.label) || raw || '').trim()
  return `${btn.emoji ? `${btn.emoji} ` : ''}${text}`
}

function mjMiscBtnTooltip(btn: MjFollowBtn): string {
  const hint = mjMiscHintText(btn)
  const raw = String(btn.label || '').trim()
  const pretty = formatMjUpstreamButtonLabel(btn.label)
  if (mjButtonIsRegenerate(btn)) {
    const base = t('drawing.mjRegenerate')
    if (!hint) return raw && raw !== pretty ? `${base}\n${raw}` : base
    return raw && raw !== pretty ? `${base}\n\n${hint}\n${raw}` : `${base}\n\n${hint}`
  }
  const quad = mjUvQuadrantLabel(btn.label)
  const head = quad ? `${btn.label} · ${quad}` : mjMiscBtnDisplayPrimary(btn)
  const parts = [head]
  if (!quad && raw && pretty && raw !== pretty) parts.push(raw)
  if (hint) parts.push('', hint)
  return parts.join('\n')
}

const varyRegionOpen = ref(false)
const varyRegionJob = ref<MjJobItem | null>(null)
/** 与局部重绘共用弹窗壳：custom-zoom 仅提交 prompt/--zoom，无蒙版 */
const mjModalFollowVariant = ref<'vary-region' | 'custom-zoom'>('vary-region')
/** 先由 submit/action 进入「窗口等待」阶段，返回的 result 作为 submit/modal 的 taskId（非父图任务 id） */
const varyRegionModalTaskId = ref('')
/** 窗口阶段拉取到的 MODAL 任务快照：imageUrl 与蒙版坐标系一致，避免用父任务缩略图导致尺寸不符 */
const varyRegionModalTaskSnap = ref<Record<string, unknown> | null>(null)
const varyRegionActionBusy = ref(false)

const mjMiscPolicyModalOpen = ref(false)
const mjMiscPolicyModalKind = ref<'animate' | 'utility' | null>(null)

function openMjMiscPolicyModal(kind: 'animate' | 'utility') {
  mjMiscPolicyModalKind.value = kind
  mjMiscPolicyModalOpen.value = true
}

function closeMjMiscPolicyModal() {
  mjMiscPolicyModalOpen.value = false
  mjMiscPolicyModalKind.value = null
}

const mjMiscPolicyModalBody = computed(() => {
  const k = mjMiscPolicyModalKind.value
  if (k === 'utility') return t('drawing.mjMiscPolicyUtilityBody')
  if (k === 'animate') return t('drawing.mjMiscPolicyAnimateBody')
  return ''
})

watch(mjMiscPolicyModalOpen, (open, _prev, onCleanup) => {
  if (!open) return
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMjMiscPolicyModal()
  }
  document.addEventListener('keydown', onKey)
  onCleanup(() => document.removeEventListener('keydown', onKey))
})

const varyRegionImageUrl = computed(() => {
  const snap = varyRegionModalTaskSnap.value
  const fromModal = snap ? collectMjImageUrls(snap)[0] : ''
  if (fromModal) return fromModal
  const j = varyRegionJob.value
  if (!j?.task) return ''
  return collectMjImageUrls(j.task)[0] || ''
})

/** 任务上的提示词：填入局部重绘框作默认文案；用户清空且不提交 prompt 时由上游沿用原任务（见 modal 文档） */
function mjTaskPromptForModal(task: Record<string, unknown> | undefined): string {
  if (!task) return ''
  const pr = task.properties as Record<string, unknown> | undefined
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const firstLine = (s: string) => {
    const line = s.split(/\r?\n/)[0]?.trim() ?? ''
    return line.replace(/^\/(?:imagine|describe|shorten)\s+/i, '').trim() || line
  }
  const tryPick = (v: unknown) => {
    const s = pick(v)
    return s ? firstLine(s) : ''
  }
  return (
    tryPick(task.promptEn) ||
    tryPick(task.prompt) ||
    tryPick(pr?.finalPrompt) ||
    tryPick(pr?.promptEn) ||
    tryPick(pr?.prompt) ||
    tryPick(task.description) ||
    ''
  )
}

/** MODAL 任务上的文案优先（与弹窗任务 id 一致），否则父任务 */
const varyRegionFallbackPrompt = computed(() => {
  const job = varyRegionJob.value
  const snap = varyRegionModalTaskSnap.value
  return mjTaskPromptForModal(snap ?? undefined) || mjTaskPromptForModal(job?.task) || ''
})

watch(varyRegionOpen, v => {
  if (!v) {
    varyRegionJob.value = null
    varyRegionModalTaskId.value = ''
    varyRegionModalTaskSnap.value = null
    mjModalFollowVariant.value = 'vary-region'
  }
})

/**
 * 局部重绘：先调 submit/action 进入 MODAL，再用返回的 taskId + 蒙版调 submit/modal（以当前代理文档为准）。
 */
async function beginVaryRegionFlow(
  job: MjJobItem,
  customId: string,
  variant: 'vary-region' | 'custom-zoom' = 'vary-region'
) {
  mjModalFollowVariant.value = variant
  const urls = mjJobImageUrls(job)
  if (!job.taskId || !urls.length) {
    ms.warning(t('drawing.mjVaryRegionNoImage'))
    return
  }
  const m = resolveMjJobModelRow(job)
  if (!m) {
    ms.warning(t('drawing.needModel'))
    return
  }
  varyRegionActionBusy.value = true
  try {
    /** 常见 OpenAPI：/mj/submit/action 仅 customId、taskId、notifyHook、state；勿默认带 botType */
    const r = await submitMjAction({
      model: m.model,
      mjMode: mjModeForFollowUp(job),
      taskId: String(job.taskId),
      customId,
    })
    const parsed = parseMjSubmitBody(r)
    if (!parsed.ok) {
      ms.error(mjTranslateKnownDrawingError(parsed.message, t) || t('common.wrong'))
      return
    }
    const mj = parsed.mj
    const modalTid = extractMjTaskId(mj as { result?: string | number; properties?: unknown })
    const code = normalizeMjSubmitCode(mj?.code)

    const openModalFollowUp =
      !!modalTid && (code === 21 || (variant === 'custom-zoom' && (code === 1 || code === 22)))

    if (openModalFollowUp) {
      varyRegionJob.value = job
      varyRegionModalTaskId.value = modalTid
      varyRegionModalTaskSnap.value = null
      const mode = mjModeForFollowUp(job)
      /** MODAL 任务刚创建时 imageUrl 可能未就绪；短暂重试，避免用父任务缩略图导致蒙版与画布尺寸不一致→上游「无效参数」 */
      try {
        let snap: Record<string, unknown> | null = null
        for (let attempt = 0; attempt < 6; attempt++) {
          const fr = await fetchMjTask(modalTid, m.model, mode)
          if (!nestResultErrorMessage(fr)) {
            const body = parseMjTaskBody(fr)
            if (body) {
              snap = body
              if (collectMjImageUrls(body).length) break
            }
          }
          if (attempt < 5) await new Promise<void>(r => setTimeout(r, 500))
        }
        if (snap) varyRegionModalTaskSnap.value = snap
      } catch {
        /* 无快照时仍用父任务图打开弹窗 */
      }
      varyRegionOpen.value = true
      return
    }

    // 少数环境：局部重绘可能不经 MODAL 直接排队（自定义变焦已在上方强制弹窗）
    if ((code === 1 || code === 22) && modalTid && variant !== 'custom-zoom') {
      ms.info(t('drawing.mjVaryRegionDirectQueued'))
      const actionBtn = mjButtons(job.task).find(b => b.customId === customId) ?? null
      const q = actionBtn ? mjUvQuadrantLabel(actionBtn.label) : ''
      const promptLabel = buildMjFollowUpPromptLabel(
        job,
        {
          btn: actionBtn,
          customId,
          quadrantText: q,
          regenerateLabel: t('drawing.mjRegenerate'),
        },
        (key, params) => t(key, params)
      )
      const newJob: MjJobItem = {
        localId: nextMjClientKey(),
        taskId: modalTid,
        promptLabel,
        loading: true,
        mjStyleSnapshot: mjStyle.value,
        queuedAtMs: Date.now(),
        ...mjParentFieldsFromSource(job),
      }
      attachMjJobModelMeta(newJob, m, { mjMode: mjModeForFollowUp(job) })
      mjJobs.value.unshift(newJob)
      startPollTask(modalTid, newJob)
      await authStore.getUserBalance()
      return
    }

    const hint = mj?.description || (code != null ? `code=${code}` : '') || t('drawing.mjNoTaskId')
    ms.error(
      variant === 'custom-zoom'
        ? t('drawing.mjCustomZoomEnterFail', { msg: hint })
        : t('drawing.mjVaryRegionEnterFail', { msg: hint })
    )
  } catch (e: unknown) {
    ms.error((e as Error)?.message || t('common.wrong'))
  } finally {
    varyRegionActionBusy.value = false
  }
}

function handleMjMiscButtonClick(job: MjJobItem, btn: MjFollowBtn) {
  const block = mjMiscButtonPolicyBlockReason(btn)
  if (block) {
    openMjMiscPolicyModal(block)
    return
  }
  if (mjButtonIsVaryRegion(btn)) {
    void beginVaryRegionFlow(job, btn.customId, 'vary-region')
    return
  }
  if (mjButtonIsCustomZoom(btn)) {
    void beginVaryRegionFlow(job, btn.customId, 'custom-zoom')
    return
  }
  void onMjButtonClick(String(job.taskId), btn.customId, job, btn)
}

function onMjMiscDropdownChange(ev: Event, job: MjJobItem) {
  const el = ev.target as HTMLSelectElement
  const customId = el.value
  if (!customId) return
  el.value = ''
  const btn = mjButtons(job.task).find(b => b.customId === customId)
  const block =
    (btn ? mjMiscButtonPolicyBlockReason(btn) : null) ??
    mjMiscPolicyBlockFromProbeText(String(customId || ''))
  if (block) {
    openMjMiscPolicyModal(block)
    return
  }
  if (btn && mjButtonIsVaryRegion(btn)) {
    void beginVaryRegionFlow(job, customId, 'vary-region')
    return
  }
  if (btn && mjButtonIsCustomZoom(btn)) {
    void beginVaryRegionFlow(job, customId, 'custom-zoom')
    return
  }
  void onMjButtonClick(String(job.taskId), customId, job, btn)
}

async function onMjVaryRegionSubmitted(res: unknown) {
  /** emit 同步触发，此时 varyRegionJob 仍在；须用源任务模型/速度与 submit/modal 一致，勿仅用当前选中项 */
  const srcJob = varyRegionJob.value
  const m = (srcJob && resolveMjJobModelRow(srcJob)) || selectedModel.value
  if (!m) return
  const actionOverride =
    mjModalFollowVariant.value === 'custom-zoom'
      ? t('drawing.mjFollowUpActionInModalCustomZoom')
      : t('drawing.mjFollowUpActionInModalVaryRegion')
  const promptLabel = buildMjFollowUpPromptLabel(
    srcJob ?? undefined,
    { actionOverride },
    (key, params) => t(key, params)
  )
  const job: MjJobItem = {
    localId: nextMjClientKey(),
    taskId: '',
    promptLabel,
    loading: true,
    mjStyleSnapshot: srcJob?.mjStyleSnapshot ?? mjStyle.value,
    queuedAtMs: Date.now(),
    ...mjParentFieldsFromSource(srcJob),
  }
  attachMjJobModelMeta(job, m, { mjMode: mjModeForFollowUp(srcJob) })
  mjJobs.value.unshift(job)
  try {
    if (!applyMjSubmitResponse(res, job)) {
      job.loading = false
      if (job.error) ms.error(job.error)
      return
    }
    assignMjJobChargeSnapshot(job, m, { kind: 'mult', mult: 1 })
    startPollTask(job.taskId, job)
    await authStore.getUserBalance()
  } catch {
    job.loading = false
    job.error = t('common.wrong')
  }
}

const mjJobSeedByLocalId = ref<Record<number, string>>({})
const mjJobSeedErrByLocalId = ref<Record<number, string>>({})
const mjJobSeedLoadingByLocalId = ref<Record<number, boolean>>({})

function pruneMjJobSeedState(localId: number) {
  const strip = <T extends Record<number, unknown>>(rec: T): T => {
    const n = { ...rec }
    delete n[localId]
    return n
  }
  mjJobSeedByLocalId.value = strip(mjJobSeedByLocalId.value)
  mjJobSeedErrByLocalId.value = strip(mjJobSeedErrByLocalId.value)
  mjJobSeedLoadingByLocalId.value = strip(mjJobSeedLoadingByLocalId.value)
}

async function removeMjJob(job: MjJobItem) {
  if (!window.confirm(t('drawing.mjDeleteConfirm'))) return
  const tid = job.taskId
  if (tid) stopPoll(tid)
  if (authStore.isLogin && job.serverJobId) {
    try {
      const ax = await deleteMjDrawingJob(job.serverJobId)
      const delWrap = ax.data as { data?: { syncSeq?: number } }
      if (typeof delWrap?.data?.syncSeq === 'number') mjListSyncSeq.value = delWrap.data.syncSeq
    } catch {
      if (tid && job.loading) startPollTask(tid, job)
      ms.error(t('drawing.mjDeleteFail'))
      return
    }
  }
  mjJobs.value = mjJobs.value.filter(j => j.localId !== job.localId)
  pruneMjJobSeedState(job.localId)
  await persistMjJobsHybrid()
}

function mjJobSeedToolbarVisible(job: MjJobItem): boolean {
  return !job.loading && !job.error && Boolean(job.taskId) && mjJobImageUrls(job).length > 0
}

function resolveMjJobModelRow(job: MjJobItem): DrawingModel | undefined {
  return (
    (job.modelKey && drawingModels.value.find(x => x.model === job.modelKey)) || selectedModel.value
  )
}

async function onMjJobFetchSeed(job: MjJobItem) {
  const live = resolveMjJobRef(job)
  if (!live?.taskId) return
  const modelRow = resolveMjJobModelRow(live)
  if (!modelRow) {
    ms.error(t('drawing.needModel'))
    return
  }
  const mode = mjModeForFollowUp(live)
  const id = live.localId
  mjJobSeedLoadingByLocalId.value = { ...mjJobSeedLoadingByLocalId.value, [id]: true }
  mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: '' }
  try {
    const r = await fetchMjImageSeed(live.taskId, modelRow.model, mode)
    const parsed = parseMjImageSeedBody(r)
    if (!parsed.ok) {
      const msg =
        parsed.message === 'no seed'
          ? t('drawing.mjSeedFetchNoValue')
          : mjTranslateKnownDrawingError(parsed.message, t) || parsed.message || t('common.wrong')
      mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: msg }
      ms.error(msg)
      return
    }
    mjJobSeedByLocalId.value = { ...mjJobSeedByLocalId.value, [id]: parsed.seed }
    mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: '' }
    ms.success(t('drawing.mjSeedFetchedOk'))
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message ? e.message : String(t('drawing.mjSeedFetchFail'))
    mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: msg }
    ms.error(msg)
  } finally {
    mjJobSeedLoadingByLocalId.value = { ...mjJobSeedLoadingByLocalId.value, [id]: false }
  }
}

function applyMjJobSeedToForm(localId: number) {
  const s = mjJobSeedByLocalId.value[localId]
  if (!s) return
  mjSeed.value = s
}

function copyMjJobSeedValue(localId: number) {
  const s = mjJobSeedByLocalId.value[localId]
  if (!s) return
  copyText({ text: s })
  ms.success(t('drawing.viewerCopied'))
}

function mjJobImageUrls(job: MjJobItem): string[] {
  return collectMjImageUrls(job.task)
}

function mjJobPhaseLabel(job: MjJobItem): string {
  if (!job.loading) return ''
  if (!job.task) return t('drawing.mjPhaseSubmitting')
  const phase = inferMjRunningPhase(job.task)
  if (phase === 'queue') return t('drawing.mjPhaseQueue')
  if (phase === 'drawing') return t('drawing.mjPhaseDrawing')
  return t('drawing.mjPhaseWaiting')
}

function mjJobProgressPercent(job: MjJobItem): number | null {
  return parseMjProgressPercent(job.task)
}

function mjJobProgressText(job: MjJobItem): string {
  const p = job.task?.progress ?? job.task?.Progress
  if (p != null && String(p).trim()) return String(p)
  return t('drawing.generating')
}

function mjJobElapsedLine(job: MjJobItem): string {
  void mjElapsedTick.value
  if (!job.loading) return ''
  const t0 = job.queuedAtMs
  if (t0 == null || !Number.isFinite(t0)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t0) / 1000))
  return t('drawing.mjElapsedSeconds', { s })
}

function mjStyleTag(style?: MjStyle): string {
  const s = style ?? mjStyle.value
  return s === 'anime' ? t('drawing.mjStyleAnime') : t('drawing.mjStyleRealistic')
}

function openMjJobImagePreview(imgUrl: string, job: MjJobItem, ix: number) {
  const { original, translated } = extractMjViewerCaptions(job)
  openImageViewer({
    imageUrl: imgUrl,
    fileName: `mj-${job.taskId || job.localId}-u${ix + 1}`,
    captionOriginal: original,
    captionTranslated: translated,
  })
}

function openStreamResultImagePreview(url: string, row: ResultItem, ix: number) {
  openImageViewer({
    imageUrl: url,
    fileName: `drawing-${row.id}-${ix + 1}`,
    captionOriginal: row.prompt?.trim() || '',
    captionTranslated: '',
  })
}
</script>

<template>
  <div class="h-full transition-all">
    <div class="h-full overflow-hidden" :class="getMobileClass">
      <div class="z-40 h-full flex" :class="getContainerClass">
        <Sider class="h-full" />
        <div
          class="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--surface-page)]"
        >
          <HeaderComponent class="relative z-10 flex-shrink-0 bg-white dark:bg-gray-800" />

          <main
            class="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--drawing-main)]"
          >
            <!-- Midjourney：左栏（菜单 + AI 绘画输入）| 中间主区（任务网格占满剩余宽度） -->
            <div v-if="isMjModel" class="flex min-h-0 flex-1 flex-col lg:flex-row">
              <!-- 左栏：侧栏单独滚动，底部「生成」固定可见（避免侧栏过长时按钮被顶出视口） -->
              <div
                class="flex min-h-0 w-full shrink-0 flex-col border-[var(--border-default)] bg-[var(--drawing-sidebar)] lg:h-full lg:max-w-[min(100%,460px)] lg:w-[min(100%,460px)] lg:border-r"
              >
                <div class="custom-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  <DrawingStudioSidebar
                    embedded
                    :drawing-models="drawingModels"
                    :selected-model-key="selectedModelKey"
                    :models-loading="modelsLoading"
                    :studio-tab="studioTab"
                    :spell-mode="spellMode"
                    :mj-mode="mjMode"
                    :mj-style="mjStyle"
                    :negative-prompt="negativePrompt"
                    :aspect-key="aspectKey"
                    :aspect-custom-ratio="aspectCustomRatio"
                    :aspect-custom-invalid="aspectCustomInvalid"
                    :mj-realistic-version="mjRealisticVersion"
                    :mj-niji-version="mjNijiVersion"
                    :mj-seed="mjSeed"
                    :custom-params-only="mjCustomParamsOnly"
                    :prompt-text="promptText"
                    :ref-image-previews="implyBase64List"
                    :blend-image-previews="blendBase64List"
                    :blend-dimensions="blendDimensions"
                    :mj-param-iw="mjParamIw"
                    :mj-param-stylize="mjParamStylize"
                    :mj-param-chaos="mjParamChaos"
                    :mj-param-weird="mjParamWeird"
                    :mj-param-stop="mjParamStop"
                    :mj-param-quality="mjParamQuality"
                    :mj-style-raw="mjStyleRaw"
                    :mj-ref-cref-url="mjRefCrefUrl"
                    :mj-param-cw="mjParamCw"
                    :mj-ref-sref-url="mjRefSrefUrl"
                    :mj-param-sw="mjParamSw"
                    :mj-param-sv="mjParamSv"
                    :mj-ref-oref-url="mjRefOrefUrl"
                    :mj-param-ow="mjParamOw"
                    :mj-param-tile="mjParamTile"
                    :mj-param-draft="mjParamDraft"
                    :mj-v8-output-mode="mjV8OutputMode"
                    :mj-param-repeat="mjParamRepeat"
                    :mj-oref-combo-lock="mjOrefComboLock"
                    @update:selected-model-key="v => (selectedModelKey = v)"
                    @update:studio-tab="v => (studioTab = v)"
                    @update:spell-mode="v => (spellMode = v)"
                    @update:mj-mode="v => (mjMode = v)"
                    @update:mj-style="v => (mjStyle = v)"
                    @update:negative-prompt="v => (negativePrompt = v)"
                    @update:aspect-key="v => (aspectKey = v)"
                    @update:aspect-custom-ratio="v => (aspectCustomRatio = v)"
                    @update:mj-realistic-version="v => (mjRealisticVersion = v)"
                    @update:mj-niji-version="v => (mjNijiVersion = v)"
                    @update:mj-seed="v => (mjSeed = v)"
                    @update:custom-params-only="setMjCustomParamsOnly"
                    @update:prompt-text="v => (promptText = v)"
                    @update:blend-dimensions="v => (blendDimensions = v)"
                    @update:mj-param-iw="setMjParamIw"
                    @update:mj-param-stylize="setMjParamStylize"
                    @update:mj-param-chaos="setMjParamChaos"
                    @update:mj-param-weird="setMjParamWeird"
                    @update:mj-param-stop="setMjParamStop"
                    @update:mj-param-quality="setMjParamQuality"
                    @update:mj-style-raw="setMjStyleRaw"
                    @update:mj-ref-cref-url="setMjRefCrefUrl"
                    @update:mjRefCrefUrl="setMjRefCrefUrl"
                    @update:mj-param-cw="setMjParamCw"
                    @update:mj-ref-sref-url="setMjRefSrefUrl"
                    @update:mjRefSrefUrl="setMjRefSrefUrl"
                    @update:mj-param-sw="setMjParamSw"
                    @update:mj-param-sv="setMjParamSv"
                    @update:mj-ref-oref-url="setMjRefOrefUrl"
                    @update:mjRefOrefUrl="setMjRefOrefUrl"
                    @update:mj-param-ow="setMjParamOw"
                    @update:mj-param-tile="setMjParamTile"
                    @update:mj-param-draft="setMjParamDraft"
                    @update:mj-v8-output-mode="setMjV8OutputMode"
                    @update:mj-param-repeat="setMjParamRepeat"
                    @mj-ref-uploading="setMjRefUploading"
                    @imagine-files="onImagineFiles"
                    @blend-files="onBlendFiles"
                    @remove-ref-image="removeImagineRef"
                    @clear-ref-images="clearImagineRefs"
                    @remove-blend-image="removeBlendRef"
                    @clear-blend-images="clearBlendRefs"
                  />
                </div>

                <div
                  class="flex shrink-0 flex-col gap-2 border-t border-[var(--border-default)] bg-gradient-to-b from-[var(--drawing-sidebar-grad-from)] to-[var(--drawing-sidebar-grad-to)] p-3 lg:gap-2.5 lg:p-4 lg:pb-5"
                >
                  <div
                    class="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--drawing-panel)] px-3 py-2"
                  >
                    <h1
                      class="text-sm font-semibold tracking-tight text-[var(--text-primary)] md:text-base"
                    >
                      {{ t('drawing.title') }}
                    </h1>
                  </div>

                  <details
                    class="group rounded-xl border border-[var(--border-default)] bg-[var(--drawing-panel)] open:border-[var(--border-default)]"
                  >
                    <summary
                      class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)]/35 hover:text-[var(--text-secondary)] [&::-webkit-details-marker]:hidden"
                    >
                      <span>{{ t('drawing.mjSideHelpFold') }}</span>
                      <span
                        class="text-[10px] text-[var(--text-muted)] transition-transform group-open:rotate-180"
                        aria-hidden="true"
                        >▾</span
                      >
                    </summary>
                    <div
                      class="space-y-3 border-t border-[var(--border-default)] px-3 pb-3 pt-2 text-[11px] leading-relaxed text-[var(--text-muted)]"
                    >
                      <p>{{ t('drawing.mjSideHint') }}</p>
                      <div
                        class="rounded-lg border border-[var(--border-default)] bg-[var(--drawing-panel)] p-2.5 text-[var(--text-muted)]"
                      >
                        <p
                          class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                        >
                          {{ t('drawing.mjPromptTipsTitle') }}
                        </p>
                        <p class="mb-1 font-medium text-emerald-800 dark:text-emerald-400/95">
                          ✓ {{ t('drawing.mjPromptTipsGood') }}
                        </p>
                        <p class="font-medium text-rose-800 dark:text-rose-400/90">
                          ✗ {{ t('drawing.mjPromptTipsBad') }}
                        </p>
                      </div>
                    </div>
                  </details>

                  <template v-if="studioTab === 'spell' && spellMode === 'describe'">
                    <div
                      class="rounded-2xl border border-[var(--border-default)] bg-[var(--drawing-panel)] p-3.5 md:p-4"
                    >
                      <span class="mb-2 block text-xs font-medium text-[var(--text-muted)]">{{
                        t('drawing.mjDescribeImage')
                      }}</span>
                      <label
                        class="relative flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--drawing-field)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-sky-500/40"
                      >
                        <input
                          type="file"
                          :accept="MJ_DRAWING_IMAGE_ACCEPT"
                          class="absolute inset-0 z-[1] h-full w-full cursor-pointer opacity-0"
                          @change="onDescribeFile"
                        />
                        <span
                          class="pointer-events-none min-w-0 flex-1 text-[11px] leading-snug text-[var(--text-muted)]"
                        >
                          {{ t('drawing.mjTapToPickOneImage') }}
                        </span>
                        <span
                          class="pointer-events-none shrink-0 rounded-lg bg-sky-600/90 px-2.5 py-1 text-[10px] font-semibold text-white"
                        >
                          {{ t('drawing.mjBrowseFiles') }}
                        </span>
                      </label>
                      <DrawingUploadPreviewGrid
                        v-if="describeBase64"
                        :urls="[describeBase64]"
                        accent="sky"
                        :show-clear-all="false"
                        @remove="removeDescribeUpload"
                      />
                    </div>
                  </template>

                  <template v-else-if="studioTab === 'spell' && spellMode === 'shorten'">
                    <section
                      class="rounded-2xl border border-[var(--border-default)] bg-[var(--drawing-panel)] p-3.5 md:p-4"
                    >
                      <label class="mb-2 block text-xs font-medium text-[var(--text-muted)]">{{
                        t('drawing.mjToolShorten')
                      }}</label>
                      <textarea
                        v-model="promptText"
                        class="min-h-[96px] w-full resize-y rounded-xl border border-[var(--border-default)] bg-[var(--drawing-field)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        :placeholder="t('drawing.mjShortenPlaceholder')"
                        rows="4"
                      />
                    </section>
                  </template>

                  <template v-else-if="studioTab === 'blend'">
                    <details
                      class="group rounded-xl border border-teal-200 bg-teal-50 open:border-teal-300 dark:border-teal-500/25 dark:bg-teal-950/15 dark:open:border-teal-500/40"
                    >
                      <summary
                        class="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-teal-900 dark:text-teal-100/95 [&::-webkit-details-marker]:hidden"
                      >
                        <span class="inline-flex w-full items-center justify-between gap-2">
                          {{ t('drawing.mjBlendHintFold') }}
                          <span
                            class="text-[10px] opacity-70 transition-transform group-open:rotate-180"
                            >▾</span
                          >
                        </span>
                      </summary>
                      <p
                        class="border-t border-teal-200 px-3 pb-2.5 pt-2 text-[10px] leading-relaxed text-teal-900 dark:border-teal-500/20 dark:text-teal-100/85"
                      >
                        {{ t('drawing.mjBlendBottomHint') }}
                      </p>
                    </details>
                  </template>

                  <template v-else-if="studioTab === 'edits'">
                    <div
                      class="space-y-2 rounded-2xl border border-violet-200 bg-violet-50 p-3 md:p-3.5 dark:border-violet-500/25 dark:bg-violet-950/15"
                    >
                      <details
                        class="group rounded-lg border border-violet-200 bg-white/60 open:border-violet-300 dark:border-violet-500/20 dark:bg-violet-950/10 dark:open:border-violet-500/35"
                      >
                        <summary
                          class="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-violet-900 dark:text-violet-200/90 [&::-webkit-details-marker]:hidden"
                        >
                          <span class="inline-flex w-full items-center justify-between gap-2">
                            {{ t('drawing.mjEditsHintFold') }}
                            <span
                              class="text-[10px] opacity-70 transition-transform group-open:rotate-180"
                              >▾</span
                            >
                          </span>
                        </summary>
                        <p
                          class="border-t border-violet-200 px-2 pb-2 pt-2 text-[10px] leading-relaxed text-violet-900 dark:border-violet-500/15 dark:text-violet-100/75"
                        >
                          {{ t('drawing.mjEditsHint') }}
                        </p>
                      </details>
                      <div>
                        <label class="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{{
                          t('drawing.mjEditsImageUrl')
                        }}</label>
                        <input
                          v-model="editsImageUrl"
                          type="url"
                          autocomplete="off"
                          class="h-10 w-full rounded-xl border border-[var(--border-default)] bg-[var(--drawing-field)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                          :placeholder="t('drawing.mjEditsUrlPlaceholder')"
                        />
                        <button
                          type="button"
                          class="mt-2 w-full rounded-lg border border-[var(--border-default)] bg-[var(--drawing-panel)] py-2 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--input-border-hover)] hover:bg-[var(--surface-muted)]"
                          @click="fillEditsUrlFromLatestJob"
                        >
                          {{ t('drawing.mjEditsFillFirstUrl') }}
                        </button>
                      </div>
                      <div>
                        <span class="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{{
                          t('drawing.mjEditsMaskOptional')
                        }}</span>
                        <label
                          class="relative flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--drawing-field)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-violet-500/40"
                        >
                          <input
                            type="file"
                            :accept="MJ_DRAWING_IMAGE_ACCEPT"
                            class="absolute inset-0 z-[1] h-full w-full cursor-pointer opacity-0"
                            @change="onEditsMaskFile"
                          />
                          <span
                            class="pointer-events-none min-w-0 flex-1 text-[11px] leading-snug text-[var(--text-muted)]"
                          >
                            {{ t('drawing.mjTapToPickOneImage') }}
                          </span>
                          <span
                            class="pointer-events-none shrink-0 rounded-lg bg-violet-600/90 px-2.5 py-1 text-[10px] font-semibold text-white"
                          >
                            {{ t('drawing.mjBrowseFiles') }}
                          </span>
                        </label>
                        <DrawingUploadPreviewGrid
                          v-if="editsMaskBase64"
                          :urls="[editsMaskBase64]"
                          accent="violet"
                          :show-clear-all="false"
                          @remove="removeEditsMaskUpload"
                        />
                        <p v-if="editsMaskBase64" class="mt-1 text-[10px] text-[var(--text-muted)]">
                          {{ t('drawing.mjEditsMaskReady') }}
                        </p>
                      </div>
                    </div>
                  </template>

                  <details
                    class="rounded-2xl border border-[var(--border-default)] bg-[var(--drawing-panel)] p-3 text-[var(--text-secondary)] open:border-[var(--border-default)] md:p-3.5"
                  >
                    <summary
                      class="cursor-pointer select-none text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {{ t('drawing.mjAdvancedApis') }}
                    </summary>
                    <div class="mt-3 space-y-4 border-t border-[var(--border-default)] pt-3">
                      <div>
                        <p
                          class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                        >
                          {{ t('drawing.mjChangeTitle') }}
                        </p>
                        <div class="flex flex-col gap-2">
                          <div class="flex flex-wrap gap-2">
                            <input
                              v-model="mjChangeTaskId"
                              type="text"
                              class="min-w-0 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--drawing-field)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                              :placeholder="t('drawing.mjChangeTaskIdPh')"
                            />
                            <button
                              type="button"
                              class="shrink-0 rounded-lg border-[var(--border-default)] bg-[var(--surface-muted)] px-2 py-1.5 text-[11px] text-[var(--text-primary)]"
                              @click="fillMjChangeTaskFromLatest"
                            >
                              {{ t('drawing.mjChangeFillLatest') }}
                            </button>
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            <select
                              v-model="mjChangeAction"
                              class="rounded-lg border border-[var(--border-default)] bg-[var(--drawing-field)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                            >
                              <option value="UPSCALE">UPSCALE</option>
                              <option value="VARIATION">VARIATION</option>
                              <option value="REGENERATE">REGENERATE</option>
                              <option value="REROLL">REROLL</option>
                            </select>
                            <label
                              class="flex items-center gap-1 text-[11px] text-[var(--text-muted)]"
                            >
                              <span>{{ t('drawing.mjChangeIndex') }}</span>
                              <input
                                v-model.number="mjChangeIndex"
                                type="number"
                                min="1"
                                max="4"
                                class="w-14 rounded border border-[var(--border-default)] bg-[var(--drawing-field)] px-1 py-1 text-xs text-[var(--text-primary)]"
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            class="w-full rounded-lg bg-slate-700/90 py-2 text-xs font-medium text-white hover:bg-slate-600"
                            @click="handleMjChangeSubmit"
                          >
                            {{ t('drawing.mjChangeSubmit') }}
                          </button>
                        </div>
                      </div>
                      <div>
                        <p
                          class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                        >
                          {{ t('drawing.mjSimpleChangeTitle') }}
                        </p>
                        <textarea
                          v-model="mjSimpleChangeContent"
                          class="mb-2 min-h-[72px] w-full resize-none rounded-lg border border-[var(--border-default)] bg-[var(--drawing-field)] px-2 py-2 text-xs text-[var(--text-primary)]"
                          :placeholder="t('drawing.mjSimpleChangePlaceholder')"
                          rows="3"
                        />
                        <button
                          type="button"
                          class="w-full rounded-lg bg-slate-700/90 py-2 text-xs font-medium text-white hover:bg-slate-600"
                          @click="handleMjSimpleChangeSubmit"
                        >
                          {{ t('drawing.mjSimpleChangeSubmit') }}
                        </button>
                      </div>
                    </div>
                  </details>

                  <button
                    type="button"
                    class="relative h-12 w-full overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-600 to-cyan-600 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(14,165,233,0.28)] transition hover:from-sky-500 hover:to-cyan-500 hover:shadow-[0_10px_32px_rgba(14,165,233,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 disabled:cursor-not-allowed disabled:opacity-45"
                    :disabled="modelsLoading || drawingModels.length === 0 || mjSubmitting"
                    @click="handleMainGenerate"
                  >
                    <span class="relative z-[1]">{{
                      mjSubmitting ? t('drawing.mjGenerateBusy') : t('drawing.generate')
                    }}</span>
                  </button>
                </div>
              </div>

              <!-- 中间主区：任务列表（大屏下列数更多） -->
              <div
                class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-[var(--border-default)] lg:border-t-0"
              >
                <div
                  class="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-default)] bg-[var(--drawing-toolbar)] px-3 py-3"
                >
                  <input
                    v-model="taskSearchQuery"
                    type="search"
                    class="input input-bordered input-sm min-w-[160px] flex-1 border-[var(--border-default)] bg-[var(--drawing-field)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    :placeholder="t('drawing.studioSearchPlaceholder')"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm shrink-0 border-[var(--border-default)] text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
                    :disabled="mjBatchSyncing || !authStore.isLogin"
                    @click="syncMjTasksBatch"
                  >
                    {{ mjBatchSyncing ? '…' : t('drawing.mjBatchSyncTasks') }}
                  </button>
                  <div
                    class="inline-flex shrink-0 overflow-hidden rounded-lg border-[var(--border-default)]"
                    role="group"
                    :aria-label="t('drawing.mjFollowUpLayoutTiled')"
                  >
                    <button
                      type="button"
                      class="border-r border-[var(--border-default)] px-2.5 py-1.5 text-[11px] font-medium transition"
                      :class="
                        mjFollowUpLayout === 'tiled'
                          ? 'bg-sky-200 text-sky-950 dark:bg-sky-900/55 dark:text-sky-100'
                          : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                      "
                      @click="mjFollowUpLayout = 'tiled'"
                    >
                      {{ t('drawing.mjFollowUpLayoutTiled') }}
                    </button>
                    <button
                      type="button"
                      class="px-2.5 py-1.5 text-[11px] font-medium transition"
                      :class="
                        mjFollowUpLayout === 'dropdown'
                          ? 'bg-sky-200 text-sky-950 dark:bg-sky-900/55 dark:text-sky-100'
                          : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                      "
                      @click="mjFollowUpLayout = 'dropdown'"
                    >
                      {{ t('drawing.mjFollowUpLayoutDropdown') }}
                    </button>
                  </div>
                </div>
                <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div class="mb-3 space-y-1">
                    <p class="text-xs font-semibold text-[var(--text-secondary)]">
                      {{ t('drawing.mjJobsHint') }}
                    </p>
                    <p class="text-[11px] leading-snug text-[var(--text-muted)]">
                      {{ t('drawing.mjTasksLocalPersist') }}
                    </p>
                  </div>
                  <div
                    v-if="filteredMjJobs.length === 0"
                    class="py-12 text-center text-sm text-[var(--text-muted)]"
                  >
                    {{ taskSearchQuery.trim() ? '—' : t('drawing.emptyHint') }}
                  </div>
                  <div
                    v-else
                    class="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  >
                    <article
                      v-for="job in filteredMjJobs"
                      :key="job.localId"
                      :data-mj-job-local-id="job.localId"
                      class="flex flex-col overflow-visible rounded-xl border border-[var(--border-default)] bg-[var(--drawing-card)] transition-shadow duration-300"
                      :class="
                        mjParentHighlightLocalId === job.localId
                          ? 'ring-2 ring-sky-400/75 ring-offset-2 ring-offset-[var(--drawing-main)]'
                          : ''
                      "
                    >
                      <div class="overflow-hidden rounded-t-xl bg-[var(--drawing-card-media)]">
                        <template v-if="job.loading">
                          <div class="flex flex-col">
                            <div v-if="mjJobImageUrls(job).length" class="relative w-full">
                              <div
                                class="w-full"
                                :class="
                                  mjJobImageUrls(job).length > 1 ? 'grid grid-cols-2 gap-0.5' : ''
                                "
                              >
                                <div
                                  v-for="(imgUrl, ix) in mjJobImageUrls(job)"
                                  :key="ix"
                                  class="relative w-full"
                                >
                                  <button
                                    type="button"
                                    class="relative block w-full cursor-zoom-in bg-black/30 p-0 text-left outline-none ring-sky-500/40 focus-visible:ring-2"
                                    @click="openMjJobImagePreview(imgUrl, job, ix)"
                                  >
                                    <div
                                      class="max-h-[min(70vh,520px)] w-full overflow-hidden opacity-95"
                                    >
                                      <MjTaskImage
                                        :key="`${job.localId}-run-${ix}-${imgUrl}`"
                                        :src="imgUrl"
                                      />
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    class="pointer-events-auto absolute bottom-1 right-1 z-[2] rounded-md border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-900 shadow-md hover:bg-violet-200 dark:border-violet-500/55 dark:bg-violet-950/90 dark:text-violet-100 dark:backdrop-blur-sm dark:hover:bg-violet-900/95"
                                    :title="t('drawing.mjEditsFillFromCardImgTitle')"
                                    @click.stop="fillEditsUrlFromJob(job, imgUrl)"
                                  >
                                    {{ t('drawing.mjEditsChip') }}
                                  </button>
                                </div>
                              </div>
                              <div
                                class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/45"
                              />
                              <div
                                class="pointer-events-none absolute inset-0 animate-pulse bg-sky-400/[0.07]"
                              />
                              <div class="pointer-events-none absolute left-2 top-2 z-[1]">
                                <span
                                  class="inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white shadow backdrop-blur-sm"
                                >
                                  <span class="loading loading-spinner loading-xs text-sky-400" />
                                  {{ mjJobPhaseLabel(job) }}
                                </span>
                              </div>
                            </div>
                            <div v-else class="grid grid-cols-2 gap-0.5 bg-black/25">
                              <div
                                v-for="si in 4"
                                :key="si"
                                class="aspect-square overflow-hidden bg-[var(--drawing-panel)]"
                              >
                                <div
                                  class="h-full w-full animate-pulse bg-gradient-to-br from-[var(--border-default)] via-[var(--surface-muted)] to-[var(--drawing-panel)]"
                                />
                              </div>
                            </div>
                            <div
                              class="space-y-2 border-t border-[var(--border-default)]/90 px-3 py-3"
                            >
                              <p
                                v-if="mjJobElapsedLine(job)"
                                class="text-center text-[11px] font-medium tabular-nums text-[var(--text-secondary)]"
                              >
                                {{ mjJobElapsedLine(job) }}
                              </p>
                              <div
                                v-if="mjJobImageUrls(job).length === 0"
                                class="flex items-center justify-center gap-2 text-center text-sm font-medium text-[var(--text-primary)]"
                              >
                                <span class="loading loading-spinner loading-sm text-sky-500" />
                                {{ mjJobPhaseLabel(job) }}
                              </div>
                              <div
                                v-if="mjJobProgressPercent(job) != null"
                                class="w-full space-y-1"
                              >
                                <progress
                                  class="progress progress-info h-2 w-full"
                                  :value="mjJobProgressPercent(job)!"
                                  max="100"
                                />
                                <p class="text-center text-xs text-sky-800 dark:text-sky-400">
                                  {{
                                    t('drawing.mjProgressPercent', {
                                      n: mjJobProgressPercent(job)!,
                                    })
                                  }}
                                </p>
                              </div>
                              <div v-else class="w-full space-y-1">
                                <div
                                  class="h-2 w-full overflow-hidden rounded-full bg-[var(--border-default)]"
                                >
                                  <div
                                    class="h-full w-full animate-pulse rounded-full bg-sky-500/40"
                                  />
                                </div>
                                <p class="text-center text-xs text-[var(--text-secondary)]">
                                  {{ mjJobProgressText(job) }}
                                </p>
                              </div>
                            </div>
                          </div>
                        </template>
                        <template v-else-if="job.error">
                          <div
                            class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
                          >
                            <span class="text-2xl text-rose-500">✕</span>
                            <p class="text-xs leading-snug text-rose-800 dark:text-rose-300">
                              {{ job.error }}
                            </p>
                          </div>
                        </template>
                        <template v-else-if="mjJobImageUrls(job).length">
                          <div
                            class="w-full"
                            :class="
                              mjJobImageUrls(job).length > 1 ? 'grid grid-cols-2 gap-0.5' : ''
                            "
                          >
                            <div
                              v-for="(imgUrl, ix) in mjJobImageUrls(job)"
                              :key="ix"
                              class="relative w-full"
                            >
                              <button
                                type="button"
                                class="block w-full cursor-zoom-in bg-black/20 p-0 text-left outline-none ring-sky-500/40 focus-visible:ring-2"
                                @click="openMjJobImagePreview(imgUrl, job, ix)"
                              >
                                <div class="max-h-[min(70vh,520px)] w-full overflow-hidden">
                                  <MjTaskImage
                                    :key="`${job.localId}-done-${ix}-${imgUrl}`"
                                    :src="imgUrl"
                                  />
                                </div>
                              </button>
                              <button
                                type="button"
                                class="pointer-events-auto absolute bottom-1 right-1 z-[2] rounded-md border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-900 shadow-md hover:bg-violet-200 dark:border-violet-500/55 dark:bg-violet-950/90 dark:text-violet-100 dark:backdrop-blur-sm dark:hover:bg-violet-900/95"
                                :title="t('drawing.mjEditsFillFromCardImgTitle')"
                                @click.stop="fillEditsUrlFromJob(job, imgUrl)"
                              >
                                {{ t('drawing.mjEditsChip') }}
                              </button>
                            </div>
                          </div>
                        </template>
                        <div
                          v-else
                          class="flex items-center justify-center px-4 py-8 text-xs text-[var(--text-muted)]"
                        >
                          <pre
                            v-if="job.task?.description || job.task?.prompt"
                            class="max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-left text-[11px] leading-relaxed text-[var(--text-muted)]"
                            >{{ job.task?.description || job.task?.prompt }}</pre
                          >
                          <span v-else>—</span>
                        </div>
                      </div>
                      <div
                        class="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] bg-[var(--drawing-card-footer)] px-3 py-2.5"
                      >
                        <span
                          v-if="job.loading"
                          class="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 pl-2 text-[11px] font-semibold tracking-wide text-amber-950 shadow-sm dark:border-amber-700/80 dark:bg-amber-950 dark:text-amber-100 dark:shadow-none"
                        >
                          <span class="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                            <span
                              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-35 dark:bg-amber-500 dark:opacity-40"
                            />
                            <span
                              class="relative inline-flex h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(251,191,36,0.9)] dark:bg-amber-400 dark:shadow-[0_0_6px_rgba(251,191,36,0.55)]"
                            />
                          </span>
                          {{ t('drawing.mjStatusRunning') }}
                        </span>
                        <span
                          v-else-if="job.error"
                          class="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-900 shadow-sm dark:border-rose-500/35 dark:bg-rose-950/45 dark:text-rose-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                        >
                          <svg
                            class="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          {{ t('drawing.mjStatusFail') }}
                        </span>
                        <span
                          v-else
                          class="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 shadow-sm dark:border-emerald-700/80 dark:bg-emerald-950 dark:text-emerald-100 dark:shadow-none"
                        >
                          <svg
                            class="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          {{ t('drawing.mjStatusDone') }}
                        </span>
                        <span
                          class="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]"
                          >{{ mjStyleTag(job.mjStyleSnapshot) }}</span
                        >
                        <button
                          v-if="mjJobImageUrls(job).length && !job.error"
                          type="button"
                          class="inline-flex shrink-0 items-center rounded-full border border-violet-300 bg-violet-100 px-2.5 py-1 text-[10px] font-semibold leading-none text-violet-900 transition hover:border-violet-400 hover:bg-violet-200 dark:border-violet-500/45 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:border-violet-400/55 dark:hover:bg-violet-900/45"
                          :title="t('drawing.mjEditsFillFromCardTitle')"
                          @click.stop="fillEditsUrlFromJob(job)"
                        >
                          {{ t('drawing.mjEditsFillFromCard') }}
                        </button>
                        <div class="ml-auto flex items-center gap-1.5">
                          <button
                            v-if="mjParentJumpVisible(job)"
                            type="button"
                            class="inline-flex shrink-0 items-center rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-[11px] font-semibold leading-none text-sky-900 shadow-sm transition hover:border-sky-400 hover:bg-sky-200 dark:border-sky-600/50 dark:bg-sky-950/35 dark:text-sky-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-sky-400/55 dark:hover:bg-sky-900/40"
                            :title="t('drawing.mjParentNavigateTitle')"
                            :aria-label="t('drawing.mjParentNavigateTitle')"
                            @click.stop="navigateToMjParentJob(job)"
                          >
                            {{ t('drawing.mjParentNavigate') }}
                          </button>
                          <button
                            type="button"
                            class="inline-flex shrink-0 items-center rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-[11px] font-semibold leading-none text-neutral-800 shadow-sm transition hover:border-rose-400 hover:bg-rose-100 hover:text-rose-900 dark:border-[var(--border-default)] dark:bg-[var(--surface-muted)] dark:text-[var(--text-secondary)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-rose-500/45 dark:hover:bg-rose-950/35 dark:hover:text-rose-100"
                            :title="t('drawing.mjDelete')"
                            :aria-label="t('drawing.mjDelete')"
                            @click.stop="removeMjJob(job)"
                          >
                            {{ t('drawing.mjDelete') }}
                          </button>
                          <span
                            v-if="job.taskId"
                            class="hidden max-w-[min(100%,9rem)] truncate font-mono text-[10px] text-neutral-700 dark:text-[var(--text-muted)] sm:inline"
                            >{{ job.taskId }}</span
                          >
                        </div>
                      </div>
                      <div
                        v-if="mjJobSeedToolbarVisible(job)"
                        class="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)]/80 px-3 py-2"
                      >
                        <details class="relative">
                          <summary
                            class="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-lg border border-sky-400/70 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900 transition hover:border-sky-500 hover:bg-sky-100 dark:border-sky-500/55 dark:bg-[var(--drawing-panel)] dark:text-sky-200/95 dark:hover:border-sky-400/70 dark:hover:bg-[var(--surface-muted)]/70 [&::-webkit-details-marker]:hidden"
                          >
                            <span class="text-[10px] opacity-90" aria-hidden="true">✉</span>
                            {{ t('drawing.mjSeedToolbar') }}
                          </summary>
                          <div
                            class="absolute bottom-[calc(100%+6px)] left-0 z-40 min-w-[156px] rounded-xl border border-[var(--border-default)] bg-[var(--drawing-popover)] p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
                            @click.stop
                          >
                            <button
                              type="button"
                              class="w-full rounded-lg border border-emerald-600 bg-emerald-100 px-2.5 py-1.5 text-center text-[11px] font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/55 dark:bg-emerald-950/25 dark:text-emerald-100 dark:hover:bg-emerald-900/35"
                              :disabled="mjJobSeedLoadingByLocalId[job.localId]"
                              @click="onMjJobFetchSeed(job)"
                            >
                              {{
                                mjJobSeedLoadingByLocalId[job.localId]
                                  ? t('drawing.mjSeedFetching')
                                  : t('drawing.mjSeedFetch')
                              }}
                            </button>
                            <p
                              v-if="mjJobSeedErrByLocalId[job.localId]"
                              class="mt-2 text-[10px] leading-snug text-rose-800 dark:text-rose-300"
                            >
                              {{ mjJobSeedErrByLocalId[job.localId] }}
                            </p>
                            <template v-else-if="mjJobSeedByLocalId[job.localId]">
                              <p
                                class="mt-2 break-all font-mono text-[11px] leading-snug text-[var(--text-primary)]"
                              >
                                {{ mjJobSeedByLocalId[job.localId] }}
                              </p>
                              <div class="mt-2 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  class="rounded-md border border-[var(--border-default)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                                  @click="applyMjJobSeedToForm(job.localId)"
                                >
                                  {{ t('drawing.mjSeedFillSidebar') }}
                                </button>
                                <button
                                  type="button"
                                  class="rounded-md border border-[var(--border-default)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                                  @click="copyMjJobSeedValue(job.localId)"
                                >
                                  {{ t('drawing.mjSeedCopy') }}
                                </button>
                              </div>
                            </template>
                          </div>
                        </details>
                      </div>
                      <div class="px-3 pb-2">
                        <p
                          v-if="mjJobChargeMetaLine(job)"
                          class="mb-1 text-[10px] leading-snug text-[var(--text-secondary)]"
                        >
                          {{ mjJobChargeMetaLine(job) }}
                        </p>
                        <template
                          v-for="cap in [extractMjViewerCaptions(job)]"
                          :key="`mj-cap-${job.localId}`"
                        >
                          <div
                            class="space-y-1.5"
                            :class="mjButtons(job.task).length ? 'mb-2' : 'mb-0'"
                          >
                            <p
                              class="line-clamp-2 text-xs font-medium text-[var(--text-secondary)]"
                            >
                              {{ cap.original || '—' }}
                            </p>
                            <div
                              class="rounded-md border border-[var(--border-default)] bg-[var(--drawing-panel)] px-2 py-1.5"
                            >
                              <p
                                class="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]"
                              >
                                {{ t('drawing.viewerCaptionTranslated') }}
                              </p>
                              <p
                                class="line-clamp-4 text-[11px] leading-snug"
                                :class="
                                  cap.translated
                                    ? 'text-[var(--text-secondary)]/95'
                                    : 'text-[var(--text-muted)]/90 italic'
                                "
                                :title="cap.translated || t('drawing.viewerCaptionTranslatedNone')"
                              >
                                {{ cap.translated || t('drawing.viewerCaptionTranslatedNone') }}
                              </p>
                            </div>
                          </div>
                        </template>
                        <div v-if="mjButtons(job.task).length" class="pb-1">
                          <p
                            v-if="mjHasUvNumberedButtons(job.task)"
                            class="mb-2 text-[10px] leading-snug text-[var(--text-secondary)]"
                          >
                            {{ t('drawing.mjUvGridLegend') }}
                          </p>

                          <template v-if="mjFollowUpLayout === 'tiled'">
                            <div
                              v-for="(seg, si) in mjButtonSegmentGroups(job.task)"
                              :key="`tile-${si}`"
                              class="mb-2 last:mb-0"
                            >
                              <template v-if="seg.type === 'upscale' || seg.type === 'variation'">
                                <p
                                  v-if="seg.type === 'upscale'"
                                  class="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-800 dark:text-sky-400/95"
                                >
                                  {{ t('drawing.mjUpscaleSection') }}
                                </p>
                                <p
                                  v-else
                                  class="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-800 dark:text-violet-400/95"
                                >
                                  {{ t('drawing.mjVariationSection') }}
                                </p>
                                <div class="flex flex-wrap gap-1.5">
                                  <button
                                    v-for="(btn, bi) in seg.items"
                                    :key="`${si}-${bi}`"
                                    type="button"
                                    class="btn btn-xs inline-flex flex-col justify-center gap-0.5 border-[var(--border-default)] bg-[var(--surface-muted)] px-2 py-1 text-[11px] normal-case leading-tight text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                                    :class="
                                      mjUvQuadrantLabel(btn.label) || mjButtonIsRegenerate(btn)
                                        ? 'min-h-[2.75rem]'
                                        : ''
                                    "
                                    :title="
                                      mjButtonIsRegenerate(btn)
                                        ? t('drawing.mjRegenerate')
                                        : mjUvQuadrantLabel(btn.label)
                                          ? `${btn.label} · ${mjUvQuadrantLabel(btn.label)}`
                                          : btn.label || btn.emoji || ''
                                    "
                                    @click="
                                      onMjButtonClick(String(job.taskId), btn.customId, job, btn)
                                    "
                                  >
                                    <template v-if="mjButtonIsRegenerate(btn)">
                                      <span
                                        v-if="btn.emoji"
                                        class="block text-center text-base leading-none"
                                        aria-hidden="true"
                                        >{{ btn.emoji }}</span
                                      >
                                      <span
                                        class="block text-center text-[10px] font-semibold leading-tight text-[var(--text-primary)]"
                                        >{{ t('drawing.mjRegenerate') }}</span
                                      >
                                    </template>
                                    <template v-else>
                                      <span>
                                        <template v-if="btn.emoji">{{ btn.emoji }} </template
                                        >{{ btn.label }}
                                      </span>
                                      <span
                                        v-if="mjUvQuadrantLabel(btn.label)"
                                        class="text-[9px] font-medium leading-none text-sky-800 dark:text-sky-400/90"
                                      >
                                        {{ mjUvQuadrantLabel(btn.label) }}
                                      </span>
                                    </template>
                                  </button>
                                </div>
                              </template>
                              <template v-else>
                                <p
                                  class="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-700 dark:text-[var(--text-muted)]/95"
                                >
                                  {{ t('drawing.mjMiscSection') }}
                                </p>
                                <div class="space-y-2">
                                  <div
                                    v-for="bucket in groupMjMiscButtons(seg.items)"
                                    :key="`${si}-${bucket.group}`"
                                    class="rounded-lg border border-[var(--border-default)] bg-[var(--drawing-card-footer)] px-2 py-1.5"
                                  >
                                    <p class="text-[10px] font-semibold text-[var(--text-primary)]">
                                      {{ t(mjMiscGroupTitleKey(bucket.group)) }}
                                    </p>
                                    <p
                                      v-if="mjMiscGroupIntroKey(bucket.group)"
                                      class="mt-0.5 line-clamp-2 text-[9px] leading-snug text-[var(--text-muted)]"
                                      :title="mjMiscGroupIntroText(bucket.group)"
                                    >
                                      {{ mjMiscGroupIntroText(bucket.group) }}
                                    </p>
                                    <div
                                      class="mt-1.5"
                                      :class="mjMiscBucketBtnWrapClass(bucket.group)"
                                    >
                                      <button
                                        v-for="(btn, bi) in bucket.items"
                                        :key="`${si}-${bucket.group}-${bi}`"
                                        type="button"
                                        :class="[
                                          mjMiscBucketBtnClass(bucket.group),
                                          mjMiscHintText(btn) ? 'cursor-help' : '',
                                        ]"
                                        :title="mjMiscBtnTooltip(btn)"
                                        @click="handleMjMiscButtonClick(job, btn)"
                                      >
                                        <template v-if="mjButtonIsRegenerate(btn)">
                                          <span
                                            v-if="btn.emoji"
                                            class="block w-full text-base leading-none"
                                            :class="
                                              bucket.group === 'pan' ? 'text-center' : 'text-left'
                                            "
                                            aria-hidden="true"
                                            >{{ btn.emoji }}</span
                                          >
                                          <span
                                            class="block w-full font-semibold leading-tight text-[var(--text-primary)]"
                                            :class="
                                              bucket.group === 'pan'
                                                ? 'text-center text-[10px]'
                                                : 'text-left text-[10px]'
                                            "
                                            >{{ t('drawing.mjRegenerate') }}</span
                                          >
                                        </template>
                                        <template v-else>
                                          <span
                                            class="block w-full break-words [word-break:break-word]"
                                            :class="
                                              bucket.group === 'pan'
                                                ? 'text-center text-[11px]'
                                                : 'text-left'
                                            "
                                          >
                                            <template v-if="btn.emoji"
                                              >{{ btn.emoji }}&nbsp;</template
                                            >{{ mjMiscBtnDisplayPrimary(btn) }}
                                          </span>
                                          <span
                                            v-if="mjUvQuadrantLabel(btn.label)"
                                            class="w-full text-[9px] font-medium leading-none text-sky-800 dark:text-sky-400/90"
                                            :class="
                                              bucket.group === 'pan' ? 'text-center' : 'text-left'
                                            "
                                          >
                                            {{ mjUvQuadrantLabel(btn.label) }}
                                          </span>
                                        </template>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </template>
                            </div>
                          </template>

                          <template v-else>
                            <div
                              v-for="(seg, si) in mjButtonSegmentGroups(job.task)"
                              :key="`drop-${si}`"
                              class="mb-2 last:mb-0"
                            >
                              <template v-if="seg.type === 'upscale'">
                                <label
                                  class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-800 dark:text-sky-400/95"
                                  >{{ t('drawing.mjUpscaleSection') }}</label
                                >
                                <select
                                  class="select select-bordered select-sm w-full border-[var(--border-default)] bg-[var(--drawing-field)] text-xs text-[var(--text-primary)]"
                                  @change="onMjFollowUpSelect($event, String(job.taskId))"
                                >
                                  <option value="">{{ t('drawing.mjFollowUpPlaceholder') }}</option>
                                  <option
                                    v-for="(btn, bi) in seg.items"
                                    :key="`${si}-${bi}`"
                                    :value="btn.customId"
                                  >
                                    {{ btn.label
                                    }}<template v-if="mjUvQuadrantLabel(btn.label)"
                                      >&nbsp;· {{ mjUvQuadrantLabel(btn.label) }}</template
                                    >
                                  </option>
                                </select>
                              </template>
                              <template v-else-if="seg.type === 'variation'">
                                <label
                                  class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-800 dark:text-violet-400/95"
                                  >{{ t('drawing.mjVariationSection') }}</label
                                >
                                <select
                                  class="select select-bordered select-sm w-full border-[var(--border-default)] bg-[var(--drawing-field)] text-xs text-[var(--text-primary)]"
                                  @change="onMjFollowUpSelect($event, String(job.taskId))"
                                >
                                  <option value="">{{ t('drawing.mjFollowUpPlaceholder') }}</option>
                                  <option
                                    v-for="(btn, bi) in seg.items"
                                    :key="`${si}-${bi}`"
                                    :value="btn.customId"
                                  >
                                    {{ btn.label
                                    }}<template v-if="mjUvQuadrantLabel(btn.label)"
                                      >&nbsp;· {{ mjUvQuadrantLabel(btn.label) }}</template
                                    >
                                  </option>
                                </select>
                              </template>
                              <template v-else>
                                <label
                                  class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-700 dark:text-[var(--text-muted)]/95"
                                  >{{ t('drawing.mjMiscSection') }}</label
                                >
                                <select
                                  class="select select-bordered select-sm w-full border-[var(--border-default)] bg-[var(--drawing-field)] text-xs text-[var(--text-primary)]"
                                  @change="onMjMiscDropdownChange($event, job)"
                                >
                                  <option value="">{{ t('drawing.mjFollowUpPlaceholder') }}</option>
                                  <template
                                    v-for="bucket in groupMjMiscButtons(seg.items)"
                                    :key="`${si}-${bucket.group}`"
                                  >
                                    <optgroup :label="t(mjMiscGroupTitleKey(bucket.group))">
                                      <option
                                        v-for="(btn, bi) in bucket.items"
                                        :key="`${si}-${bucket.group}-${bi}`"
                                        :value="btn.customId"
                                        :title="mjMiscBtnTooltip(btn)"
                                      >
                                        {{ mjMiscOptionLabel(btn) }}
                                      </option>
                                    </optgroup>
                                  </template>
                                </select>
                              </template>
                            </div>
                          </template>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
              <MjVaryRegionModal
                v-model:open="varyRegionOpen"
                :task-id="varyRegionModalTaskId"
                :image-url="varyRegionImageUrl"
                :model-key="varyRegionJob?.modelKey ?? selectedModelKey ?? ''"
                :mj-mode="varyRegionJob ? mjModeForFollowUp(varyRegionJob) : mjMode"
                :fallback-prompt="varyRegionFallbackPrompt"
                :variant="mjModalFollowVariant"
                @submitted="onMjVaryRegionSubmitted"
              />
              <Teleport to="body">
                <div
                  v-if="mjMiscPolicyModalOpen"
                  class="fixed inset-0 z-[10060] flex items-center justify-center bg-black/60 px-3"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="mj-misc-policy-title"
                  @click.self="closeMjMiscPolicyModal"
                >
                  <div
                    class="w-full max-w-md rounded-xl border border-[var(--border-default)] bg-[var(--drawing-card)] p-5 shadow-2xl"
                    @click.stop
                  >
                    <h3
                      id="mj-misc-policy-title"
                      class="text-base font-semibold text-[var(--text-primary)]"
                    >
                      {{ t('drawing.mjMiscPolicyModalTitle') }}
                    </h3>
                    <p class="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {{ mjMiscPolicyModalBody }}
                    </p>
                    <button
                      type="button"
                      class="btn btn-primary mt-5 w-full border-0 bg-sky-600 text-white hover:bg-sky-500"
                      @click="closeMjMiscPolicyModal"
                    >
                      {{ t('drawing.mjMiscPolicyGotIt') }}
                    </button>
                  </div>
                </div>
              </Teleport>
            </div>

            <!-- 非 MJ：通用流式 -->
            <div
              v-else
              class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 custom-scrollbar"
            >
              <div>
                <h1 class="text-xl font-semibold text-[var(--text-primary)]">
                  {{ t('drawing.title') }}
                </h1>
                <p class="mt-1 text-sm text-[var(--text-muted)]">{{ t('drawing.subtitle') }}</p>
              </div>

              <div
                class="flex flex-col gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--drawing-card)] p-4 shadow-inner"
              >
                <label class="text-sm font-medium text-[var(--text-secondary)]">{{
                  t('drawing.selectModel')
                }}</label>
                <select
                  v-model="selectedModelKey"
                  class="select select-bordered w-full border-[var(--border-default)] bg-[var(--drawing-field)] text-[var(--text-primary)]"
                  :disabled="modelsLoading || drawingModels.length === 0"
                >
                  <option v-if="drawingModels.length === 0" value="">
                    {{ modelsLoading ? '…' : t('drawing.noModels') }}
                  </option>
                  <option v-for="opt in drawingModels" :key="opt.model" :value="opt.model">
                    {{ opt.modelName }}
                  </option>
                </select>

                <label class="text-sm font-medium text-[var(--text-secondary)]">{{
                  t('drawing.sizeLabel')
                }}</label>
                <select
                  v-model="extraSize"
                  class="select select-bordered w-full border-[var(--border-default)] bg-[var(--drawing-field)] text-[var(--text-primary)]"
                >
                  <option v-for="s in sizeOptions" :key="s.value" :value="s.value">
                    {{ s.label }}
                  </option>
                </select>
                <textarea
                  v-model="promptText"
                  class="textarea textarea-bordered min-h-[120px] w-full border-[var(--border-default)] bg-[var(--drawing-field)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  :placeholder="t('drawing.promptPlaceholder')"
                  rows="4"
                />

                <button
                  type="button"
                  class="btn btn-primary w-full border-0 bg-sky-600 hover:bg-sky-500"
                  :disabled="modelsLoading || drawingModels.length === 0 || isStreamIn"
                  @click="handleMainGenerate"
                >
                  {{ isStreamIn ? t('drawing.generating') : t('drawing.generate') }}
                </button>
              </div>

              <div class="flex flex-col gap-4 pb-8">
                <h2 class="text-sm font-medium text-[var(--text-muted)]">
                  {{ t('drawing.emptyHint') }}
                </h2>
                <div
                  v-if="results.length === 0"
                  class="text-center text-sm text-[var(--text-muted)]"
                >
                  —
                </div>
                <article
                  v-for="row in results"
                  :key="row.id"
                  class="rounded-xl border border-[var(--border-default)] bg-[var(--drawing-card)] p-4"
                >
                  <p class="mb-2 text-xs font-medium text-[var(--text-secondary)]">
                    {{ row.prompt }}
                  </p>
                  <div
                    v-if="row.loading"
                    class="flex items-center gap-2 text-sm text-sky-800 dark:text-sky-400"
                  >
                    <span class="loading loading-spinner loading-sm" />
                    {{ t('drawing.generating') }}
                  </div>
                  <p v-else-if="row.error" class="text-sm text-rose-700 dark:text-rose-400">
                    {{ row.error }}
                  </p>
                  <div v-else class="flex flex-col gap-3">
                    <div
                      v-if="extractImageUrls(row.text).length"
                      class="grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                      <button
                        v-for="(url, uidx) in extractImageUrls(row.text)"
                        :key="uidx"
                        type="button"
                        class="block w-full cursor-zoom-in overflow-hidden rounded-lg border-[var(--border-default)] p-0 text-left outline-none ring-sky-500/40 focus-visible:ring-2"
                        @click="openStreamResultImagePreview(url, row, uidx)"
                      >
                        <img :src="url" class="h-auto max-h-[420px] w-full object-contain" alt="" />
                      </button>
                    </div>
                    <pre
                      v-if="row.text && !extractImageUrls(row.text).length"
                      class="whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]"
                      >{{ row.text }}</pre
                    >
                  </div>
                </article>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
    <div class="overflow-hidden">
      <Login :visible="loginDialog" />
      <BadWordsDialog :visible="badWordsDialog" />
      <SettingsDialog v-if="!isMobile" :visible="settingsDialog" />
      <MobileSettingsDialog v-else :visible="mobileSettingsDialog" />
    </div>
  </div>
</template>
