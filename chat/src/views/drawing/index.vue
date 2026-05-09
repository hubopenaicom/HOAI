<script setup lang="ts">
import {
  batchUpsertMjDrawingJobs,
  fetchMjDrawingJobsList,
  fetchMjImageSeed,
  fetchMjTask,
  submitMjAction,
  submitMjDescribe,
  submitMjImagine,
  submitMjShorten,
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
import type {
  MjNijiVersion,
  MjRealisticVersion,
  MjStyle,
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
  collectMjImageUrls,
  extractMjViewerCaptions,
  extractMjTaskId,
  inferMjRunningPhase,
  isMjSubmitAcceptedCode,
  mjTaskPollOutcome,
  nestResultErrorMessage,
  parseMjImageSeedBody,
  parseMjProgressPercent,
  parseMjSubmitBody,
  parseMjTaskBody,
} from '@/utils/mjApiParse'
import HeaderComponent from '@/views/chat/components/Header/index.vue'
import Sider from '@/views/chat/components/sider/index.vue'
import { useChat } from '@/views/chat/hooks/useChat'
import { watchDebounced } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'

type StudioTab = 't2i' | 'i2i' | 'spell'
type SpellMode = 'describe' | 'shorten'

interface DrawingModel {
  modelName: string
  keyType: number
  model: string
  deduct: number
  deductType: number
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
  /** 提交时的模型 model 字段，用于恢复轮询 */
  modelKey?: string
  mjModeSnapshot?: MjSpeedMode
  promptLabel: string
  loading: boolean
  error?: string
  task?: Record<string, unknown>
  mjStyleSnapshot?: MjStyle
}

const MJ_TYPE = 3
const MJ_JOBS_STORAGE_VER = 1
const MAX_MJ_JOBS_STORED = 80
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
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
/** 开启后 buildMjPrompt 仅返回用户输入，不附加 --ar / --v / --niji / --no（mjMode 仍为接口参数） */
const mjCustomParamsOnly = ref(false)
const MJ_CUSTOM_PARAMS_LS = 'hoai_drawing_mj_custom_params_only'
const MJ_VER_LS = 'hoai_drawing_mj_realistic_version'
const MJ_NIJI_LS = 'hoai_drawing_mj_niji_version'
const MJ_SEED_LS = 'hoai_drawing_mj_seed'
const mjSubmitting = ref(false)
const taskSearchQuery = ref('')
const mjJobs = ref<MjJobItem[]>([])
const implyBase64List = ref<string[]>([])
const describeBase64 = ref('')
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()

const selectedModel = computed(() =>
  drawingModels.value.find(x => x.model === selectedModelKey.value)
)

function mjJobsStorageKey(): string {
  const uid = authStore.userInfo?.id
  return `hoai_drawing_mj_jobs_v${MJ_JOBS_STORAGE_VER}_${uid ?? 'guest'}`
}

function attachMjJobModelMeta(job: MjJobItem, m: DrawingModel) {
  job.modelKey = m.model
  job.mjModeSnapshot = mjMode.value
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
    modelKey: row.modelKey,
    mjModeSnapshot: row.mjMode,
    mjStyleSnapshot: (row.mjStyleSnapshot as MjStyle | undefined) ?? 'realistic',
    promptLabel: row.promptLabel,
    loading: !!row.loading,
    error: row.error,
    task: row.task,
  }
}

function mjJobToSnapshot(job: MjJobItem): MjDrawingJobSnapshot {
  return {
    clientKey: job.localId,
    taskId: job.taskId || undefined,
    modelKey: job.modelKey || '',
    mjMode: job.mjModeSnapshot || 'fast',
    mjStyleSnapshot: job.mjStyleSnapshot,
    promptLabel: job.promptLabel,
    loading: job.loading,
    error: job.error,
    task: job.task,
  }
}

async function loadMjJobsFromApi(): Promise<void> {
  if (!authStore.isLogin) return
  try {
    const res = await fetchMjDrawingJobsList({ limit: MAX_MJ_JOBS_STORED })
    const wrap = res as unknown as { data?: { list?: MjDrawingJobDto[] } }
    const incoming = (wrap.data?.list ?? []).map(mjDrawingJobDtoToLocal)
    const map = new Map<number, MjJobItem>()
    for (const j of incoming) map.set(j.localId, j)
    for (const cur of [...mjJobs.value]) {
      const hit = map.get(cur.localId)
      map.set(cur.localId, hit ? mergeMjJobWithRemote(cur, hit) : cur)
    }
    mjJobs.value = [...map.values()].sort((a, b) => b.localId - a.localId)
  } catch {
    mjJobs.value = loadMjJobsFromStorage()
  }
}

async function persistMjJobsHybrid() {
  if (!persistMjJobsReady.value) return
  if (authStore.isLogin) {
    try {
      await batchUpsertMjDrawingJobs({
        jobs: mjJobs.value.slice(0, MAX_MJ_JOBS_STORED).map(mjJobToSnapshot),
      })
    } catch {
      persistMjJobsToStorage()
    }
  } else {
    persistMjJobsToStorage()
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

function buildMjPrompt(userMsg: string): string {
  const base = userMsg.trim()
  if (mjCustomParamsOnly.value) return base
  const parts: string[] = [base, mjArSuffix.value]
  if (mjStyle.value === 'anime') parts.push(`--niji ${mjNijiVersion.value}`)
  else parts.push(`--v ${mjRealisticVersion.value}`)
  const seedPart = mjSeedSuffix(mjSeed.value)
  if (seedPart) parts.push(seedPart)
  const neg = negativePrompt.value.trim()
  if (neg) parts.push(`--no ${neg.replace(/\s+/g, ' ')}`)
  return parts.filter(Boolean).join(' ')
}

function loadMjCustomParamsPref() {
  try {
    mjCustomParamsOnly.value = localStorage.getItem(MJ_CUSTOM_PARAMS_LS) === '1'
  } catch {
    /* ignore */
  }
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

function applyMjSubmitResponse(r: unknown, job: MjJobItem): boolean {
  const parsed = parseMjSubmitBody(r)
  if (!parsed.ok) {
    job.error = parsed.message || t('common.wrong')
    return false
  }
  const mj = parsed.mj
  if (!isMjSubmitAcceptedCode(mj?.code)) {
    job.error =
      mj?.description || (mj?.code != null ? `submit code=${mj.code}` : '') || t('common.wrong')
    return false
  }
  const tid = extractMjTaskId(mj as { result?: string | number; properties?: unknown })
  if (!tid) {
    job.error = mj?.description || t('drawing.mjNoTaskId')
    return false
  }
  job.taskId = tid
  return true
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
  return {
    ...remote,
    ...local,
    serverJobId: remote.serverJobId ?? local.serverJobId,
    task,
    loading,
    error: local.error ?? remote.error,
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
    const mode = live.mjModeSnapshot ?? mjMode.value
    if (!modelRow) {
      stopPoll(taskId)
      live.loading = false
      live.error = live.error || t('drawing.needModel')
      return
    }
    n++
    if (n > 120) {
      stopPoll(taskId)
      live.loading = false
      live.error = live.error || 'timeout'
      return
    }
    try {
      const r = await fetchMjTask(taskId, modelRow.model, mode)
      const nestErr = nestResultErrorMessage(r)
      if (nestErr) {
        stopPoll(taskId)
        live.loading = false
        live.error = nestErr
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

      stopPoll(taskId)
      live.loading = false
      if (outcome.phase === 'done_fail') {
        live.error = outcome.message || 'FAILURE'
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
  const id = setInterval(() => void tick(), 2500)
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
  if (persistMjJobsReady.value) void persistMjJobsHybrid()
  pollTimers.forEach(t => clearInterval(t))
  pollTimers.clear()
})

async function handleMjImagine() {
  const m = selectedModel.value
  if (!m) return
  const msg = promptText.value.trim()
  if (!msg) {
    ms.warning(t('drawing.needPrompt'))
    return
  }
  if (studioTab.value === 'i2i' && implyBase64List.value.length < 1) {
    ms.warning(t('drawing.i2iNeedImage'))
    return
  }
  const fullPrompt = buildMjPrompt(msg)
  const job: MjJobItem = {
    localId: Date.now(),
    taskId: '',
    promptLabel: msg,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
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
    localId: Date.now(),
    taskId: '',
    promptLabel: 'Describe',
    loading: true,
    mjStyleSnapshot: mjStyle.value,
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
    localId: Date.now(),
    taskId: '',
    promptLabel: msg,
    loading: true,
    mjStyleSnapshot: mjStyle.value,
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
    startPollTask(job.taskId, job)
  } catch (e: unknown) {
    job.loading = false
    job.error = (e as Error)?.message || t('common.wrong')
  }
}

async function onMjButtonClick(taskId: string, customId: string) {
  const m = selectedModel.value
  if (!m) return
  const job: MjJobItem = {
    localId: Date.now(),
    taskId: '',
    promptLabel: t('drawing.mjFollowUp'),
    loading: true,
    mjStyleSnapshot: mjStyle.value,
  }
  attachMjJobModelMeta(job, m)
  mjJobs.value.unshift(job)
  try {
    const r = await submitMjAction({
      model: m.model,
      mjMode: mjMode.value,
      taskId,
      customId,
    })
    if (!applyMjSubmitResponse(r, job)) {
      job.loading = false
      return
    }
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
  const list: string[] = []
  for (let i = 0; i < files.length; i++) {
    list.push(await fileToBase64(files[i]))
  }
  implyBase64List.value = list
  inp.value = ''
}

async function onDescribeFile(e: Event) {
  const inp = e.target as HTMLInputElement
  const file = inp.files?.[0]
  if (!file) return
  describeBase64.value = await fileToBase64(file)
  inp.value = ''
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
    }
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
})

watch(mjNijiVersion, v => {
  try {
    localStorage.setItem(MJ_NIJI_LS, v)
  } catch {
    /* ignore */
  }
})

watch(mjSeed, v => {
  try {
    localStorage.setItem(MJ_SEED_LS, v)
  } catch {
    /* ignore */
  }
})

watch(drawingSessionGroupId, v => {
  try {
    if (v != null && v > 0)
      sessionStorage.setItem(STORAGE_KEY_DRAWING_BIND_GROUP, String(v))
    else sessionStorage.removeItem(STORAGE_KEY_DRAWING_BIND_GROUP)
  } catch {
    /* ignore */
  }
})

onMounted(async () => {
  loadMjCustomParamsPref()
  loadMjVersionSeedPrefs()
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
  const btns = task?.buttons as
    | Array<{ customId: string; label: string; emoji?: string }>
    | undefined
  return Array.isArray(btns) ? btns : []
}

const mjJobSeedByLocalId = ref<Record<number, string>>({})
const mjJobSeedErrByLocalId = ref<Record<number, string>>({})
const mjJobSeedLoadingByLocalId = ref<Record<number, boolean>>({})

function mjJobSeedToolbarVisible(job: MjJobItem): boolean {
  return !job.loading && !job.error && Boolean(job.taskId) && mjJobImageUrls(job).length > 0
}

function resolveMjJobModelRow(job: MjJobItem): DrawingModel | undefined {
  return (
    (job.modelKey && drawingModels.value.find(x => x.model === job.modelKey)) ||
    selectedModel.value
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
  const mode = live.mjModeSnapshot ?? mjMode.value
  const id = live.localId
  mjJobSeedLoadingByLocalId.value = { ...mjJobSeedLoadingByLocalId.value, [id]: true }
  mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: '' }
  try {
    const r = await fetchMjImageSeed(live.taskId, modelRow.model, mode)
    const parsed = parseMjImageSeedBody(r)
    if (!parsed.ok) {
      const msg =
        parsed.message === 'no seed' ? t('drawing.mjSeedFetchNoValue') : parsed.message
      mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: msg }
      ms.error(msg)
      return
    }
    mjJobSeedByLocalId.value = { ...mjJobSeedByLocalId.value, [id]: parsed.seed }
    mjJobSeedErrByLocalId.value = { ...mjJobSeedErrByLocalId.value, [id]: '' }
    ms.success(t('drawing.mjSeedFetchedOk'))
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message ? e.message : String(t('drawing.mjSeedFetchFail'))
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
          <HeaderComponent
            class="relative z-10 flex-shrink-0 bg-white dark:bg-gray-800 backdrop-blur-sm"
          />

          <main
            class="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0e14] dark:bg-[#0a0e14]"
          >
            <!-- Midjourney：左栏（菜单 + AI 绘画输入）| 中间主区（任务网格占满剩余宽度） -->
            <div v-if="isMjModel" class="flex min-h-0 flex-1 flex-col lg:flex-row">
              <!-- 左栏：侧栏单独滚动，底部「生成」固定可见（避免侧栏过长时按钮被顶出视口） -->
              <div
                class="flex min-h-0 w-full shrink-0 flex-col border-slate-800/80 bg-[#06090e] lg:h-full lg:max-w-[min(100%,460px)] lg:w-[min(100%,460px)] lg:border-r lg:border-slate-700/35"
              >
                <div
                  class="custom-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
                >
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
                    :ref-image-count="implyBase64List.length"
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
                    @update:custom-params-only="v => (mjCustomParamsOnly = v)"
                    @update:prompt-text="v => (promptText = v)"
                    @imagine-files="onImagineFiles"
                  />
                </div>

                <div
                  class="flex shrink-0 flex-col gap-3 border-t border-slate-700/40 bg-gradient-to-b from-[#070a10] to-[#05070c] p-4 lg:gap-4 lg:pb-6"
                >
                  <header
                    class="rounded-2xl border border-slate-700/30 bg-slate-900/20 px-4 py-3 backdrop-blur-sm"
                  >
                    <h1 class="text-base font-semibold tracking-tight text-slate-100 md:text-lg">
                      {{ t('drawing.title') }}
                    </h1>
                    <p class="mt-1 text-[11px] leading-relaxed text-slate-500 md:text-xs">
                      {{ t('drawing.mjSideHint') }}
                    </p>
                  </header>

                  <div
                    class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3.5 text-xs leading-relaxed text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-4"
                  >
                    <p
                      class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                    >
                      {{ t('drawing.mjPromptTipsTitle') }}
                    </p>
                    <p class="mb-1.5 text-emerald-400/95">✓ {{ t('drawing.mjPromptTipsGood') }}</p>
                    <p class="text-rose-400/90">✗ {{ t('drawing.mjPromptTipsBad') }}</p>
                  </div>

                  <template v-if="studioTab === 'spell' && spellMode === 'describe'">
                    <div
                      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3.5 md:p-4"
                    >
                      <label class="mb-2 block text-xs font-medium text-slate-400">{{
                        t('drawing.mjDescribeImage')
                      }}</label>
                      <input
                        type="file"
                        accept="image/*"
                        class="file-input h-10 w-full rounded-xl border border-slate-600/50 bg-slate-950/50 text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600/90 file:px-3 file:text-xs file:text-white"
                        @change="onDescribeFile"
                      />
                    </div>
                  </template>

                  <template v-else-if="studioTab === 'spell' && spellMode === 'shorten'">
                    <section
                      class="rounded-2xl border border-slate-700/35 bg-slate-900/30 p-3.5 md:p-4"
                    >
                      <label class="mb-2 block text-xs font-medium text-slate-400">{{
                        t('drawing.mjToolShorten')
                      }}</label>
                      <textarea
                        v-model="promptText"
                        class="min-h-[140px] w-full resize-none rounded-xl border border-slate-600/50 bg-slate-950/50 px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        :placeholder="t('drawing.mjShortenPlaceholder')"
                        rows="5"
                      />
                    </section>
                  </template>

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
                class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-slate-800 lg:border-t-0"
              >
                <div
                  class="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-[#0f1419] px-3 py-3"
                >
                  <input
                    v-model="taskSearchQuery"
                    type="search"
                    class="input input-bordered input-sm min-w-[160px] flex-1 border-slate-600 bg-[#151b26] text-sm text-slate-200 placeholder:text-slate-600"
                    :placeholder="t('drawing.studioSearchPlaceholder')"
                  />
                </div>
                <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div class="mb-3 space-y-1">
                    <p class="text-xs font-medium text-slate-500">{{ t('drawing.mjJobsHint') }}</p>
                    <p class="text-[11px] leading-snug text-slate-600">
                      {{ t('drawing.mjTasksLocalPersist') }}
                    </p>
                  </div>
                  <div
                    v-if="filteredMjJobs.length === 0"
                    class="py-12 text-center text-sm text-slate-600"
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
                      class="flex flex-col overflow-visible rounded-xl border border-slate-700/80 bg-[#121822]"
                    >
                      <div class="overflow-hidden rounded-t-xl bg-[#0c1018]">
                        <template v-if="job.loading">
                          <div class="flex flex-col">
                            <div v-if="mjJobImageUrls(job).length" class="relative w-full">
                              <div
                                class="w-full"
                                :class="
                                  mjJobImageUrls(job).length > 1 ? 'grid grid-cols-2 gap-0.5' : ''
                                "
                              >
                                <button
                                  v-for="(imgUrl, ix) in mjJobImageUrls(job)"
                                  :key="ix"
                                  type="button"
                                  class="relative block w-full cursor-zoom-in bg-black/30 p-0 text-left outline-none ring-sky-500/40 focus-visible:ring-2"
                                  @click="openMjJobImagePreview(imgUrl, job, ix)"
                                >
                                  <img
                                    :src="imgUrl"
                                    class="h-auto w-full max-h-[min(70vh,520px)] object-contain align-bottom opacity-95"
                                    loading="lazy"
                                    alt=""
                                  />
                                </button>
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
                                class="aspect-square overflow-hidden bg-slate-900/80"
                              >
                                <div
                                  class="h-full w-full animate-pulse bg-gradient-to-br from-slate-600/50 via-slate-800/80 to-slate-950"
                                />
                              </div>
                            </div>
                            <div class="space-y-2 border-t border-slate-800/90 px-3 py-3">
                              <div
                                v-if="mjJobImageUrls(job).length === 0"
                                class="flex items-center justify-center gap-2 text-center text-sm font-medium text-slate-200"
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
                                <p class="text-center text-xs text-sky-400">
                                  {{
                                    t('drawing.mjProgressPercent', {
                                      n: mjJobProgressPercent(job)!,
                                    })
                                  }}
                                </p>
                              </div>
                              <div v-else class="w-full space-y-1">
                                <div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    class="h-full w-full animate-pulse rounded-full bg-sky-500/40"
                                  />
                                </div>
                                <p class="text-center text-xs text-slate-400">
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
                            <p class="text-xs leading-snug text-rose-300">{{ job.error }}</p>
                          </div>
                        </template>
                        <template v-else-if="mjJobImageUrls(job).length">
                          <div
                            class="w-full"
                            :class="
                              mjJobImageUrls(job).length > 1 ? 'grid grid-cols-2 gap-0.5' : ''
                            "
                          >
                            <button
                              v-for="(imgUrl, ix) in mjJobImageUrls(job)"
                              :key="ix"
                              type="button"
                              class="block w-full cursor-zoom-in bg-black/20 p-0 text-left outline-none ring-sky-500/40 focus-visible:ring-2"
                              @click="openMjJobImagePreview(imgUrl, job, ix)"
                            >
                              <img
                                :src="imgUrl"
                                class="h-auto w-full max-h-[min(70vh,520px)] object-contain align-bottom"
                                loading="lazy"
                                alt=""
                              />
                            </button>
                          </div>
                        </template>
                        <div
                          v-else
                          class="flex items-center justify-center px-4 py-8 text-xs text-slate-500"
                        >
                          <pre
                            v-if="job.task?.description || job.task?.prompt"
                            class="max-h-[280px] overflow-auto whitespace-pre-wrap break-words text-left text-[11px] leading-relaxed text-slate-400"
                            >{{ job.task?.description || job.task?.prompt }}</pre
                          >
                          <span v-else>—</span>
                        </div>
                      </div>
                      <div
                        class="flex flex-wrap items-center gap-2 border-t border-slate-800/90 bg-[#0d1219]/80 px-3 py-2.5"
                      >
                        <span
                          v-if="job.loading"
                          class="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500/[0.14] to-orange-600/[0.08] px-2.5 py-1 pl-2 text-[11px] font-semibold tracking-wide text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]"
                        >
                          <span class="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                            <span
                              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-35"
                            />
                            <span
                              class="relative inline-flex h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                            />
                          </span>
                          {{ t('drawing.mjStatusRunning') }}
                        </span>
                        <span
                          v-else-if="job.error"
                          class="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-950/45 px-2.5 py-1 text-[11px] font-semibold text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                        >
                          <svg
                            class="h-3.5 w-3.5 shrink-0 text-rose-400"
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
                          class="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-gradient-to-r from-emerald-500/[0.16] to-teal-600/[0.1] px-2.5 py-1 text-[11px] font-semibold text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]"
                        >
                          <svg
                            class="h-3.5 w-3.5 shrink-0 text-emerald-400"
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
                          class="inline-flex items-center rounded-full border border-slate-600/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-400"
                          >{{ mjStyleTag(job.mjStyleSnapshot) }}</span
                        >
                        <span
                          v-if="job.taskId"
                          class="ml-auto hidden font-mono text-[10px] text-slate-600 sm:inline"
                          >{{ job.taskId }}</span
                        >
                      </div>
                      <div
                        v-if="mjJobSeedToolbarVisible(job)"
                        class="flex flex-wrap items-center gap-2 border-t border-slate-800/80 px-3 py-2"
                      >
                        <details class="relative">
                          <summary
                            class="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-lg border border-sky-500/55 bg-slate-900/55 px-2.5 py-1 text-[11px] font-semibold text-sky-200/95 transition hover:border-sky-400/70 hover:bg-slate-800/70 [&::-webkit-details-marker]:hidden"
                          >
                            <span class="text-[10px] opacity-90" aria-hidden="true">✉</span>
                            {{ t('drawing.mjSeedToolbar') }}
                          </summary>
                          <div
                            class="absolute bottom-[calc(100%+6px)] left-0 z-40 min-w-[156px] rounded-xl border border-slate-600/80 bg-[#131a24] p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
                            @click.stop
                          >
                            <button
                              type="button"
                              class="w-full rounded-lg border border-emerald-500/55 bg-emerald-950/25 px-2.5 py-1.5 text-center text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-50"
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
                              class="mt-2 text-[10px] leading-snug text-rose-300"
                            >
                              {{ mjJobSeedErrByLocalId[job.localId] }}
                            </p>
                            <template v-else-if="mjJobSeedByLocalId[job.localId]">
                              <p
                                class="mt-2 break-all font-mono text-[11px] leading-snug text-slate-100"
                              >
                                {{ mjJobSeedByLocalId[job.localId] }}
                              </p>
                              <div class="mt-2 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  class="rounded-md border border-slate-600/70 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-slate-700/80"
                                  @click="applyMjJobSeedToForm(job.localId)"
                                >
                                  {{ t('drawing.mjSeedFillSidebar') }}
                                </button>
                                <button
                                  type="button"
                                  class="rounded-md border border-slate-600/70 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-200 hover:bg-slate-700/80"
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
                          class="line-clamp-2 text-xs text-slate-500"
                          :class="mjButtons(job.task).length ? 'mb-2' : 'mb-0'"
                        >
                          {{ job.promptLabel }}
                        </p>
                        <div v-if="mjButtons(job.task).length" class="flex flex-wrap gap-1.5 pb-1">
                          <button
                            v-for="(btn, bi) in mjButtons(job.task)"
                            :key="bi"
                            type="button"
                            class="btn btn-xs border-slate-600 bg-slate-800/80 text-[11px] normal-case text-slate-200 hover:bg-slate-700"
                            @click="onMjButtonClick(String(job.taskId), btn.customId)"
                          >
                            {{ btn.emoji || '' }} {{ btn.label }}
                          </button>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </div>

            <!-- 非 MJ：通用流式 -->
            <div
              v-else
              class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 custom-scrollbar"
            >
              <div>
                <h1 class="text-xl font-semibold text-slate-100">{{ t('drawing.title') }}</h1>
                <p class="mt-1 text-sm text-slate-500">{{ t('drawing.subtitle') }}</p>
              </div>

              <div
                class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-[#121822] p-4 shadow-inner"
              >
                <label class="text-sm font-medium text-slate-300">{{
                  t('drawing.selectModel')
                }}</label>
                <select
                  v-model="selectedModelKey"
                  class="select select-bordered w-full border-slate-600 bg-[#151b26] text-slate-100"
                  :disabled="modelsLoading || drawingModels.length === 0"
                >
                  <option v-if="drawingModels.length === 0" value="">
                    {{ modelsLoading ? '…' : t('drawing.noModels') }}
                  </option>
                  <option v-for="opt in drawingModels" :key="opt.model" :value="opt.model">
                    {{ opt.modelName }}
                  </option>
                </select>

                <label class="text-sm font-medium text-slate-300">{{
                  t('drawing.sizeLabel')
                }}</label>
                <select
                  v-model="extraSize"
                  class="select select-bordered w-full border-slate-600 bg-[#151b26] text-slate-100"
                >
                  <option v-for="s in sizeOptions" :key="s.value" :value="s.value">
                    {{ s.label }}
                  </option>
                </select>
                <textarea
                  v-model="promptText"
                  class="textarea textarea-bordered min-h-[120px] w-full border-slate-600 bg-[#151b26] text-base text-slate-100 placeholder:text-slate-600"
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
                <h2 class="text-sm font-medium text-slate-500">{{ t('drawing.emptyHint') }}</h2>
                <div v-if="results.length === 0" class="text-center text-sm text-slate-600">—</div>
                <article
                  v-for="row in results"
                  :key="row.id"
                  class="rounded-xl border border-slate-700 bg-[#121822] p-4"
                >
                  <p class="mb-2 text-xs text-slate-500">{{ row.prompt }}</p>
                  <div v-if="row.loading" class="flex items-center gap-2 text-sm text-sky-400">
                    <span class="loading loading-spinner loading-sm" />
                    {{ t('drawing.generating') }}
                  </div>
                  <p v-else-if="row.error" class="text-sm text-rose-400">{{ row.error }}</p>
                  <div v-else class="flex flex-col gap-3">
                    <div
                      v-if="extractImageUrls(row.text).length"
                      class="grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                      <button
                        v-for="(url, uidx) in extractImageUrls(row.text)"
                        :key="uidx"
                        type="button"
                        class="block w-full cursor-zoom-in overflow-hidden rounded-lg border border-slate-600 p-0 text-left outline-none ring-sky-500/40 focus-visible:ring-2"
                        @click="openStreamResultImagePreview(url, row, uidx)"
                      >
                        <img :src="url" class="h-auto max-h-[420px] w-full object-contain" alt="" />
                      </button>
                    </div>
                    <pre
                      v-if="row.text && !extractImageUrls(row.text).length"
                      class="whitespace-pre-wrap break-words text-sm text-slate-200"
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
