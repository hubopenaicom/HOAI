<script setup lang="ts">
import { fetchMusicModelsListAPI } from '@/api/models'
import {
  batchUpsertSunoMusicJobsAPI,
  deleteSunoMusicJobAPI,
  fetchSunoMusicJobsAPI,
  sunoConcatAPI,
  sunoExpandTagsAPI,
  sunoFeedAPI,
  sunoGenerateAPI,
  sunoLyricsFetchAPI,
  sunoLyricsSubmitAPI,
  sunoGetMidiAPI,
  sunoGetMp4API,
  sunoGetTimingAPI,
  sunoGetWavAPI,
  sunoPersonaCreateAPI,
  sunoUploadByUrlAPI,
  sunoGetVoxAPI,
  type SunoMusicModel,
} from '@/api/sunoMusic'
import MusicClipDetailModal from '@/components/music/MusicClipDetailModal.vue'
import MusicExportResultModal from '@/components/music/MusicExportResultModal.vue'
import MusicExtendConcatWizard from '@/components/music/MusicExtendConcatWizard.vue'
import MusicMidiModal from '@/components/music/MusicMidiModal.vue'
import MusicStemModal from '@/components/music/MusicStemModal.vue'
import MusicStudioSidebar from '@/components/music/MusicStudioSidebar.vue'
import MusicTimingModal from '@/components/music/MusicTimingModal.vue'
import MusicVoxModal from '@/components/music/MusicVoxModal.vue'
import MusicWorkArea from '@/components/music/MusicWorkArea.vue'
import Login from '@/components/Login/Login.vue'
import MobileSettingsDialog from '@/components/MobileSettingsDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useAuthStore, useGlobalStoreWithOut } from '@/store'
import {
  normalizeSunoModelVersion,
  SUNO_DEFAULT_MODEL_VERSION,
  upgradeLegacyImplicitSunoMv,
  type MusicClipItem,
  type MusicEditMode,
  type MusicFormState,
  type MusicPrimaryTab,
  type MusicProcessMode,
  type SunoModelVersion,
} from '@/types/music'
import { resolveSunoMvForEditMode } from '@/utils/sunoEditMvPolicy'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import {
  clearRestoreMusicStudioFlag,
  clearMusicClipsCache,
  loadMusicClipsCache,
  loadMusicStudioSnapshot,
  loadStoredSunoMv,
  saveMusicClipsCache,
  saveMusicStudioSnapshot,
  shouldRestoreMusicStudio,
  STORAGE_KEY_MUSIC_PERSONA_ID,
  STORAGE_KEY_MUSIC_PRIMARY_TAB,
  STORAGE_KEY_MUSIC_SELECTED_MODEL,
  STORAGE_KEY_MUSIC_SELECTED_MV,
} from '@/utils/musicClientStorage'
import {
  buildStemSeparationPayload,
  buildSunoGeneratePayload,
  sunoChargeMultForForm,
  sunoSceneLabelForForm,
} from '@/utils/sunoBuildPayload'
import {
  parseUploadClipIdOrThrow,
  unwrapMusicApiData as unwrapApiData,
} from '@/utils/sunoApiUnwrap'
import { clipContextFromFeed, resolveClipContext } from '@/utils/sunoClipContext'
import { fetchClipsForPoll } from '@/utils/sunoFeedBatch'
import {
  clipToCloudJson,
  mapCloudMusicJobsToClips,
  parseCloudMusicJobsResponse,
} from '@/utils/sunoJobCloud'
import { sunoUploadAudioSmart } from '@/utils/sunoUploadPipeline'
import {
  createMusicUploadAnalyzeTicker,
  musicUploadAnalyzingPercent,
  musicUploadDonePercent,
  musicUploadPollingPercent,
  musicUploadPreparingPercent,
  musicUploadProcessingPercent,
  musicUploadProcessingTickPercent,
  musicUploadTransferPercent,
  MUSIC_UPLOAD_POLL_MAX,
  type MusicUploadProgressState,
} from '@/utils/musicUploadProgress'
import { MusicUploadSpeedTracker } from '@/utils/musicUploadSpeed'
import { readAudioDurationSec } from '@/utils/readAudioDuration'
import {
  formatSunoMusicError,
  sunoMusicErrorKind,
  type SunoMusicErrorKind,
} from '@/utils/sunoErrorMessage'
import {
  canCreatePersonaFromClip,
  canUsePersonaSing,
  formatUploadMaxFileMb,
  SUNO_UPLOAD_MAX_FILE_BYTES,
} from '@/utils/sunoCapabilityGuards'
import {
  feedClipStemMeta,
  getStemsForSource,
  listClipsWithoutStemChildren,
  stemChargeMult,
  stemSceneLabel,
  type PollStemContext,
} from '@/utils/sunoStemUtils'
import { downloadJsonFile, pollMidiComplete, pollMp4Url, pollWavUrl } from '@/utils/sunoExportPoll'
import { groupPendingClipsForResume } from '@/utils/musicClipResumePoll'
import {
  formForMusicGeneration,
  isVocalCreateForm,
  lyricsThemeFromForm,
} from '@/utils/sunoLyricsWorkflow'
import { parseLyricsPollResult, parseLyricsSubmitTaskId } from '@/utils/sunoLyricsParse'
import {
  applyFeedToPollGroup,
  expandGenerateClipsToVariantSlots,
  isPollGroupAllDone,
  type PollGroupMember,
} from '@/utils/sunoPollGroup'
import { reconcileAllClipStatuses } from '@/utils/musicClipStatus.util'
import { isClipGenerationSettled, isClipPlaybackReady } from '@/utils/musicClipPlaybackReady'
import {
  attachClipCreationProvenance,
  type ClipCreationProvenance,
} from '@/utils/musicClipProvenance'
import { estimateMusicJobDeduct } from '@/utils/musicClipBilling'
import { refreshMusicClipsFromFeed } from '@/utils/musicClipFeedRefresh'
import { mergeMusicClipLists } from '@/utils/musicClipMerge'
import { formatUploadDurationLimitSec, checkUploadDurationForMv } from '@/utils/sunoMvLimits'
import {
  extractFeedClipErrorMessage,
  feedClipHasFailed,
  feedClipToMusicItem,
  parseSunoFeedClips,
  parseSunoGenerateClips,
  SUNO_POLL_INTERVAL_MS,
  SUNO_POLL_MAX_ITERATIONS,
  type SunoFeedClip,
} from '@/utils/sunoFeedParse'
import HeaderComponent from '@/views/chat/components/Header/index.vue'
import Sider from '@/views/chat/components/sider/index.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

function loadStoredPrimaryTab(): MusicPrimaryTab {
  try {
    const v = localStorage.getItem(STORAGE_KEY_MUSIC_PRIMARY_TAB)
    if (v === 'create' || v === 'edit' || v === 'process' || v === 'tools') return v
  } catch {
    /* ignore */
  }
  return 'create'
}

function loadStoredModelKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_MUSIC_SELECTED_MODEL) || ''
  } catch {
    return ''
  }
}

const defaultForm = (): MusicFormState => ({
  primaryTab: loadStoredPrimaryTab(),
  createMode: 'inspire',
  editMode: 'extend',
  processMode: 'all_stems',
  toolsMode: 'upload',
  mv: loadStoredSunoMv(),
  title: '',
  tags: '',
  prompt: '',
  gptDescriptionPrompt: '',
  makeInstrumental: false,
  targetClipId: '',
  continueAt: null,
  infillStartS: null,
  infillEndS: null,
  overpaintingStartS: null,
  overpaintingEndS: null,
  underpaintingStartS: null,
  underpaintingEndS: null,
  sourceIsUpload: false,
  uploadAudioUrl: '',
  negativeTags: '',
  styleWeight: null,
  weirdnessConstraint: null,
  vocalGender: '',
  concatClipId: '',
  concatIsInfill: false,
  personaName: '',
  personaDescription: '',
  personaRootClipId: '',
  personaIsPublic: true,
  personaId: (() => {
    try {
      return localStorage.getItem(STORAGE_KEY_MUSIC_PERSONA_ID) || ''
    } catch {
      return ''
    }
  })(),
  artistClipId: '',
  audioWeight: 0.5,
  useLyricsFirst: true,
})

const appStore = useAppStore()
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const { isMobile } = useBasicLayout()

const form = ref<MusicFormState>(defaultForm())
const musicModels = ref<SunoMusicModel[]>([])
const selectedModelKey = ref(loadStoredModelKey())
const clips = ref<MusicClipItem[]>([])
const activeClipId = ref<string | undefined>()
const playingClipId = ref<string | undefined>()
const submitting = ref(false)
const lyricsGenerating = ref(false)

/** 同步锁：防止 submitting 尚未驱动按钮 disabled 时连点触发重复 generate */
let submitSyncLock = false

function tryAcquireSubmitLock(): boolean {
  if (submitSyncLock || submitting.value) return false
  submitSyncLock = true
  submitting.value = true
  return true
}

function releaseSubmitLock() {
  submitSyncLock = false
  submitting.value = false
}

function prependClips(rows: MusicClipItem[]) {
  if (!rows.length) return
  const seenClipIds = new Set(clips.value.map(c => c.clipId).filter(Boolean))
  const fresh = rows.filter(r => !r.clipId || !seenClipIds.has(r.clipId))
  if (!fresh.length) return
  const freshLocalIds = new Set(fresh.map(r => r.id))
  clips.value = [...fresh, ...clips.value.filter(c => !freshLocalIds.has(c.id))]
}

function clipCreationProvenance(chargeMult = 1): ClipCreationProvenance {
  const model = musicModels.value.find(m => m.model === selectedModelKey.value)
  const billing = estimateMusicJobDeduct(model, chargeMult)
  return {
    modelKey: selectedModelKey.value.trim() || undefined,
    sunoMv: form.value.mv,
    gptDescriptionPrompt: form.value.gptDescriptionPrompt.trim() || undefined,
    negativeTags: form.value.negativeTags.trim() || undefined,
    styleWeight: form.value.styleWeight,
    weirdnessConstraint: form.value.weirdnessConstraint,
    vocalGender: form.value.vocalGender || undefined,
    audioWeight: form.value.audioWeight,
    ...billing,
  }
}

function rowsFromGeneratedClips(
  generated: ReturnType<typeof parseSunoGenerateClips>,
  opts: {
    idPrefix: string
    createdAt: number
    sceneLabel: string
    taskId?: string
    title?: string
    tags?: string
    lyricsText?: string
    dualVariant?: boolean
    provenance?: ClipCreationProvenance
  }
): MusicClipItem[] {
  const slots =
    opts.dualVariant === false ? generated : expandGenerateClipsToVariantSlots(generated)
  const provenance = opts.provenance ?? clipCreationProvenance()
  return slots.map((g, idx) =>
    attachClipCreationProvenance(
      {
        id: `${opts.idPrefix}-${opts.createdAt}-${idx}`,
        clipId: g.id,
        pollAnchorClipId: g.id || undefined,
        title: opts.title || g.id.slice(0, 8) || `Track ${idx + 1}`,
        tags: opts.tags,
        status: g.status,
        sceneLabel: opts.sceneLabel,
        lyricsText: opts.lyricsText,
        taskId: opts.taskId,
        createdAt: opts.createdAt,
      },
      provenance,
      idx
    )
  )
}
const tagsExpanding = ref(false)
const expandedTags = ref('')
const uploadFileName = ref('')
const uploading = ref(false)
const uploadError = ref('')
const uploadErrorKind = ref<SunoMusicErrorKind | ''>('')
const uploadProgress = ref<MusicUploadProgressState | null>(null)
const uploadMode = ref<'file' | 'url' | null>(null)
const lastUploadClipId = ref('')
const modelsLoading = ref(true)
const clipsHydrated = ref(false)
const jobsHydrating = ref(false)
const musicSyncSeq = ref(0)
const timingModalVisible = ref(false)
const timingModalData = ref<unknown>(null)
const timingModalTitle = ref('')
const midiModalVisible = ref(false)
const midiModalData = ref<unknown>(null)
const midiModalTitle = ref('')
const midiModalLoading = ref(false)
const midiModalClipId = ref('')
const exportResultVisible = ref(false)
const exportResultKind = ref<'wav' | 'mp4'>('wav')
const exportResultUrl = ref('')
const exportResultTitle = ref('')
const exportResultLoading = ref(false)
const exportBusy = ref(false)
const detailActionBusy = ref<MusicDetailActionKind | null>(null)
const sidebarRef = ref<InstanceType<typeof MusicStudioSidebar> | null>(null)
const sidebarFocusToken = ref(0)
const voxModalVisible = ref(false)
const voxModalClip = ref<MusicClipItem | null>(null)
const voxModalUrl = ref('')
const voxSubmitting = ref(false)
const lyricsPlayerVisible = ref(false)
const lyricsPlayerClip = ref<MusicClipItem | null>(null)
const lyricsTimingData = ref<unknown>(null)
const lyricsTimingLoading = ref(false)
const wizardVisible = ref(false)
const wizardRef = ref<InstanceType<typeof MusicExtendConcatWizard> | null>(null)
const wizardWatchClipIds = ref<string[]>([])
const stemModalVisible = ref(false)
const stemModalSource = ref<MusicClipItem | null>(null)
const stemSubmitting = ref(false)
const clipDetailVisible = ref(false)
const clipDetailClip = ref<MusicClipItem | null>(null)

const pollTimers = new Set<ReturnType<typeof setTimeout>>()

const collapsed = computed(() => appStore.siderCollapsed)
const loginDialog = computed(() => authStore.loginDialog)
const settingsDialog = computed(() => useGlobalStore.settingsDialog)
const mobileSettingsDialog = computed(() => useGlobalStore.mobileSettingsDialog)

const stemModalClips = computed(() => {
  const src = stemModalSource.value
  if (!src) return []
  return getStemsForSource(clips.value, src.clipId)
})

const personaRootBlocked = computed(() => {
  const root = form.value.personaRootClipId.trim()
  if (!root) return false
  const clip = clips.value.find(c => c.clipId === root)
  return clip ? !canCreatePersonaFromClip(clip) : false
})

const getMobileClass = computed(() => {
  if (isMobile.value) return ['rounded-none', 'shadow-none']
  return ['rounded-none', 'shadow-md', 'dark:border-gray-900']
})

const getContainerClass = computed(() => [
  'h-full',
  'transition-[padding]',
  'duration-300',
  { 'pl-[260px]': !isMobile.value && !collapsed.value },
])

function resolveFormClipContext(targetClipId?: string) {
  const id = (targetClipId ?? form.value.targetClipId).trim()
  return resolveClipContext(id, clips.value, {
    isUpload: form.value.sourceIsUpload || undefined,
  })
}

function taskIdFromGenerateBody(body: Record<string, unknown>): string | undefined {
  const tid = String(body.task_id ?? body.request_id ?? '').trim()
  return tid || undefined
}

function reportUploadProgress(state: MusicUploadProgressState) {
  uploadProgress.value = state
}

function clearUploadProgress() {
  uploadProgress.value = null
}

async function resolveUploadClipId(
  model: string,
  token: string,
  onPoll?: (round: number) => void
): Promise<string> {
  const id = token.trim()
  if (!id) return ''
  for (let i = 0; i < MUSIC_UPLOAD_POLL_MAX; i++) {
    onPoll?.(i + 1)
    try {
      const res = await sunoFeedAPI(model, id, { silent: true })
      const list = parseSunoFeedClips(unwrapApiData(res))
      const found = list.find(c => String(c.id) === id) ?? list[0]
      if (found?.id) {
        if (feedClipHasFailed(found)) {
          throw new Error(extractFeedClipErrorMessage(found) || 'upload_failed')
        }
        return String(found.id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg && msg !== 'upload_failed' && !msg.includes('Network')) throw e
    }
    await sleep(SUNO_POLL_INTERVAL_MS)
  }
  return id
}

function setUploadFailure(errText: string, kind: SunoMusicErrorKind | '' = '') {
  uploadError.value = errText
  uploadErrorKind.value = kind || sunoMusicErrorKind(errText)
}

async function applyClipAfterUpload(
  clipId: string,
  opts?: {
    editMode?: MusicEditMode
    primaryTab?: MusicPrimaryTab
    fileName?: string
    keepTab?: boolean
    localId?: string
  }
) {
  const model = selectedModelKey.value.trim()
  const prevRow = opts?.localId ? clips.value.find(c => c.id === opts.localId) : undefined
  const createdAt = prevRow?.createdAt ?? Date.now()
  const localId = opts?.localId ?? `upload-${createdAt}`
  const sceneLabel = t('music.uploadSceneLabel')
  let duration: number | undefined
  let tags = form.value.tags
  let title = opts?.fileName?.replace(/\.[^.]+$/, '') || clipId.slice(0, 8)
  let status: MusicClipItem['status'] = 'submitted'
  let audioUrl: string | undefined
  let imageUrl: string | undefined

  if (model) {
    try {
      const feedRes = await sunoFeedAPI(model, clipId, { silent: true })
      const feedClips = parseSunoFeedClips(unwrapApiData(feedRes))
      const fc = feedClips.find(c => String(c.id) === clipId) ?? feedClips[0]
      if (fc) {
        if (feedClipHasFailed(fc)) {
          throw new Error(extractFeedClipErrorMessage(fc) || t('music.uploadFail'))
        }
        const item = feedClipToMusicItem(fc, { localId, sceneLabel, createdAt })
        duration = item.duration ?? duration
        tags = item.tags || tags
        title = item.title || title
        status = item.status
        audioUrl = item.audioUrl
        imageUrl = item.imageUrl
      }
    } catch {
      /* poll will refresh */
    }
  }

  const continueAt = duration != null ? Math.max(0, Math.floor(duration - 1)) : null
  const endS = duration ?? null
  const row: MusicClipItem = {
    id: localId,
    clipId,
    title,
    tags,
    status,
    audioUrl,
    imageUrl,
    duration,
    sceneLabel,
    isUploadClip: true,
    createdAt,
  }
  clips.value = [row, ...clips.value.filter(c => c.id !== localId)]
  activeClipId.value = clipId
  lastUploadClipId.value = clipId

  form.value = {
    ...form.value,
    targetClipId: clipId,
    sourceIsUpload: true,
    primaryTab: opts?.keepTab ? form.value.primaryTab : (opts?.primaryTab ?? 'edit'),
    editMode: opts?.editMode ?? 'extend',
    continueAt,
    overpaintingStartS: 0,
    overpaintingEndS: endS,
    underpaintingStartS: 0,
    underpaintingEndS: endS,
    infillEndS: endS,
    tags: tags || form.value.tags,
  }

  if (model) {
    void pollClipGroup(model, [{ localId, clipId, sceneLabel, createdAt }])
    void syncJobsToCloud()
  }

  if (duration != null) {
    message.success(t('music.uploadOkWithDuration', { sec: duration.toFixed(1) }))
  } else {
    message.success(t('music.uploadOkList'))
  }
}

function persistPrefs() {
  try {
    localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MV, form.value.mv)
    localStorage.setItem(STORAGE_KEY_MUSIC_PRIMARY_TAB, form.value.primaryTab)
    if (selectedModelKey.value) {
      localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MODEL, selectedModelKey.value)
    }
  } catch {
    /* ignore */
  }
}

function updateClipLocal(localId: string, patch: Partial<MusicClipItem>) {
  const ix = clips.value.findIndex(c => c.id === localId)
  if (ix < 0) return
  const prev = clips.value[ix]
  const merged: MusicClipItem = {
    ...prev,
    ...patch,
    pollAnchorClipId: prev.pollAnchorClipId || prev.clipId || patch.pollAnchorClipId,
  }
  const [reconciled] = reconcileAllClipStatuses([merged])
  clips.value[ix] = reconciled
}

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    const t = setTimeout(() => {
      pollTimers.delete(t)
      resolve()
    }, ms)
    pollTimers.add(t)
  })
}

async function syncJobsToCloud() {
  if (!authStore.isLogin || !selectedModelKey.value) return
  try {
    const jobs = listClipsWithoutStemChildren(clips.value)
      .slice(0, 80)
      .map(c => {
        const enriched = { ...c, modelKey: c.modelKey || selectedModelKey.value }
        return {
          clientKey: c.id,
          clipId: c.clipId,
          modelKey: selectedModelKey.value,
          sceneLabel: c.sceneLabel,
          promptLabel: c.title,
          status: c.status,
          loading: !isClipGenerationSettled(c),
          error: c.status === 'error' ? 'error' : undefined,
          clip: clipToCloudJson(enriched),
          deductCharged: enriched.deductCharged,
          chargeMult: enriched.chargeMult,
          deductTypeSnapshot: enriched.deductTypeSnapshot,
        }
      })
    const res = await batchUpsertSunoMusicJobsAPI({ jobs, baseSyncSeq: musicSyncSeq.value })
    const body = unwrapApiData<{ syncSeq?: number; stale?: boolean }>(res)
    if (body?.syncSeq != null) musicSyncSeq.value = Number(body.syncSeq)
    if (body?.stale) {
      const fresh = await fetchSunoMusicJobsAPI(80, { silent: true })
      const freshBody = unwrapApiData<{ syncSeq: number }>(fresh)
      musicSyncSeq.value = Number(freshBody?.syncSeq ?? musicSyncSeq.value)
      await batchUpsertSunoMusicJobsAPI({ jobs, baseSyncSeq: musicSyncSeq.value })
    }
  } catch {
    /* ignore */
  }
}

function loadPersistedClipsOnBoot(userId?: number | string | null) {
  try {
    const snap = loadMusicStudioSnapshot()
    const sessionClips = snap?.clips ?? []
    const cached = loadMusicClipsCache(userId)
    const merged = mergeMusicClipLists(cached, sessionClips, clips.value)
    if (!merged.length) return
    clips.value = reconcileAllClipStatuses(merged)
    if (snap?.activeClipId) activeClipId.value = snap.activeClipId
  } catch {
    /* ignore corrupt local cache */
  }
}

async function refreshClipsFeedInBackground() {
  const model = selectedModelKey.value.trim()
  if (!model || !clips.value.length) {
    resumePendingClipPolls()
    return
  }
  try {
    clips.value = await refreshMusicClipsFromFeed(model, clips.value)
    void syncJobsToCloud()
  } catch {
    /* ignore */
  }
  resumePendingClipPolls()
}

async function hydrateMusicClipsFromCloud() {
  if (!authStore.isLogin) return
  jobsHydrating.value = true
  try {
    const res = await Promise.race([
      fetchSunoMusicJobsAPI(80, { silent: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('jobs timeout')), 15000)),
    ])
    const { list, syncSeq } = parseCloudMusicJobsResponse(res)
    musicSyncSeq.value = syncSeq
    if (list.length) {
      const fromDb = mapCloudMusicJobsToClips(list)
      if (fromDb.length) {
        const dbIds = new Set(fromDb.map(c => c.id))
        const localPending = clips.value.filter(
          c => !dbIds.has(c.id) && !isClipGenerationSettled(c)
        )
        clips.value = mergeMusicClipLists(fromDb, localPending)
      }
    }
    clips.value = reconcileAllClipStatuses(clips.value)
    void refreshClipsFeedInBackground()
  } catch {
    /* 云端不可用时保留已展示的本地/会话列表 */
  } finally {
    jobsHydrating.value = false
  }
}

function resumePendingClipPolls() {
  const model = selectedModelKey.value.trim()
  if (!model) return
  for (const members of groupPendingClipsForResume(clips.value)) {
    void pollClipGroup(model, members)
  }
}

function upsertStemClipFromFeed(
  fc: SunoFeedClip,
  ent: { localId: string; clipId: string; sceneLabel: string; createdAt: number },
  stemCtx: PollStemContext
) {
  const clipId = String(fc.id ?? ent.clipId).trim()
  if (!clipId || clipId === stemCtx.parentClipId) return

  const stemMeta = feedClipStemMeta(
    fc,
    stemCtx.parentClipId,
    stemCtx.stemGroupId,
    stemCtx.sceneLabel
  )
  const existing = clips.value.find(c => c.clipId === clipId)
  const prev = existing ?? clips.value.find(x => x.id === ent.localId)
  const item = feedClipToMusicItem(fc, {
    localId: existing?.id ?? ent.localId,
    sceneLabel: stemCtx.sceneLabel,
    createdAt: ent.createdAt,
    lyricsText: prev?.lyricsText,
  })
  const merged: MusicClipItem = { ...item, ...stemMeta, clipId }

  if (existing) {
    updateClipLocal(existing.id, merged)
    return
  }

  const localId = `${stemCtx.stemGroupId}-${clipId.slice(0, 8)}`
  const row: MusicClipItem = { ...merged, id: localId }
  clips.value = [row, ...clips.value.filter(c => c.id !== localId)]
}

async function pollClipGroup(model: string, entries: PollGroupMember[], stemCtx?: PollStemContext) {
  const hasClipIds = entries.some(e => e.clipId)
  const hasTaskIds = entries.some(e => {
    const row = clips.value.find(c => c.id === e.localId)
    return Boolean(row?.taskId?.trim())
  })
  if (!hasClipIds && !hasTaskIds) return

  let groupMembers = [...entries]

  for (let i = 0; i < SUNO_POLL_MAX_ITERATIONS; i++) {
    await sleep(SUNO_POLL_INTERVAL_MS)
    try {
      const feedClips = await fetchClipsForPoll(model, groupMembers, clips.value)

      if (stemCtx && feedClips.length) {
        const ent = groupMembers[0] ?? groupMembers[groupMembers.length - 1]
        if (ent) {
          for (const fc of feedClips) upsertStemClipFromFeed(fc, ent, stemCtx)
        }
        for (const ent of groupMembers) {
          const fc = feedClips.find(
            x => String(x.id) === ent.clipId || String(x.clip_id) === ent.clipId
          )
          if (fc) upsertStemClipFromFeed(fc, ent, stemCtx)
        }
      } else if (feedClips.length) {
        groupMembers = applyFeedToPollGroup(feedClips, groupMembers, {
          getClipRow: localId => clips.value.find(c => c.id === localId),
          patchClip: (localId, patch) => updateClipLocal(localId, patch),
          insertClip: row => {
            clips.value = [
              { ...row, pollAnchorClipId: row.pollAnchorClipId || row.clipId },
              ...clips.value.filter(c => c.id !== row.id),
            ]
          },
        })
        const firstComplete = groupMembers
          .map(m => clips.value.find(c => c.id === m.localId))
          .find(c => c && isClipPlaybackReady(c))
        if (firstComplete?.clipId) activeClipId.value = firstComplete.clipId
      }

      const allDone = stemCtx
        ? feedClips.length > 0 &&
          feedClips.every(fc => {
            const id = String(fc.id ?? '').trim()
            const c = clips.value.find(x => x.clipId === id)
            return c && isClipGenerationSettled(c)
          })
        : isPollGroupAllDone(groupMembers, localId => clips.value.find(c => c.id === localId))

      if (allDone) {
        void syncJobsToCloud()
        if (stemCtx) message.success(t('music.stemModalDone'))
        return
      }
    } catch {
      /* continue polling */
    }
  }
  message.warning(t('music.pollTimeout'))
}

async function pollLyricsTask(model: string, taskId: string) {
  for (let i = 0; i < SUNO_POLL_MAX_ITERATIONS; i++) {
    await sleep(SUNO_POLL_INTERVAL_MS)
    try {
      const res = await sunoLyricsFetchAPI(model, taskId)
      const result = parseLyricsPollResult(unwrapApiData(res))
      if (result.status === 'error') {
        throw new Error(result.failReason || t('music.lyricsFail'))
      }
      if (result.status === 'complete' && result.text) return result
    } catch (e: unknown) {
      if (e instanceof Error && e.message && !e.message.includes('fetch')) throw e
    }
  }
  throw new Error(t('music.pollTimeout'))
}

async function ensureLyricsReady(model: string, theme: string) {
  const res = await sunoLyricsSubmitAPI({ model, prompt: theme })
  const body = unwrapApiData<Record<string, unknown>>(res)
  const taskId = parseLyricsSubmitTaskId(body)
  if (!taskId) {
    throw new Error(t('music.lyricsFail'))
  }
  const result = await pollLyricsTask(model, taskId)
  form.value = {
    ...form.value,
    prompt: result.text,
    title: result.title || form.value.title,
  }
  message.success(t('music.lyricsReady'))
}

async function handleGenerateLyrics() {
  if (submitSyncLock || submitting.value || lyricsGenerating.value) return
  if (!authStore.isLogin) {
    message.warning(t('music.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (!isVocalCreateForm(form.value) || !form.value.useLyricsFirst) return
  const theme = lyricsThemeFromForm(form.value)
  if (!theme) {
    message.warning(t('music.lyricsThemeRequired'))
    return
  }
  lyricsGenerating.value = true
  try {
    await ensureLyricsReady(model, theme)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message || e)
    message.error(msg || t('music.lyricsFail'))
  } finally {
    lyricsGenerating.value = false
  }
}

async function pollMidi(model: string, clipId: string, localId: string) {
  updateClipLocal(localId, { midiState: 'running', status: 'streaming' })
  try {
    const data = await pollMidiComplete(() =>
      sunoGetMidiAPI(model, clipId).then(res => unwrapApiData(res))
    )
    updateClipLocal(localId, {
      midiState: 'complete',
      midiData: data,
      status: 'complete',
      sceneLabel: 'MIDI·完成',
    })
    midiModalData.value = data
    midiModalTitle.value = clips.value.find(c => c.id === localId)?.title || clipId
    midiModalClipId.value = clipId
    midiModalVisible.value = true
    message.success(t('music.midiReady'))
  } catch {
    updateClipLocal(localId, { midiState: 'error', status: 'error' })
    message.warning(t('music.pollTimeout'))
  }
}

async function handleSubmit() {
  if (submitSyncLock || submitting.value || lyricsGenerating.value) return
  if (!authStore.isLogin) {
    message.warning(t('music.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }

  if (form.value.primaryTab === 'tools' && form.value.toolsMode === 'tags') {
    await handleExpandTags()
    return
  }

  if (
    form.value.primaryTab === 'edit' &&
    form.value.editMode === 'persona_sing' &&
    !form.value.personaId.trim()
  ) {
    message.warning(t('music.personaIdRequired'))
    return
  }
  if (form.value.primaryTab === 'edit' && form.value.editMode === 'persona_sing') {
    const target = clips.value.find(c => c.clipId === form.value.targetClipId.trim())
    if (target && !canUsePersonaSing(target)) {
      message.warning(t('music.limitPersonaUploadClip'))
      return
    }
  }

  if (form.value.primaryTab === 'process' && form.value.processMode === 'midi') {
    const clipId = form.value.targetClipId.trim()
    if (!clipId) {
      message.warning(t('music.targetClipPlaceholder'))
      return
    }
    const localId = `midi-${Date.now()}`
    clips.value = [
      {
        id: localId,
        clipId,
        title: `MIDI ${clipId.slice(0, 8)}`,
        status: 'streaming',
        sceneLabel: 'MIDI',
        createdAt: Date.now(),
      },
      ...clips.value,
    ]
    void pollMidi(model, clipId, localId)
    return
  }

  if (form.value.primaryTab === 'tools' && form.value.toolsMode === 'concat') {
    const clipId = form.value.concatClipId.trim()
    if (!clipId) {
      message.warning(t('music.concatClipRequired'))
      return
    }
    if (!tryAcquireSubmitLock()) return
    try {
      const res = await sunoConcatAPI(model, clipId, form.value.concatIsInfill)
      const body = unwrapApiData<Record<string, unknown>>(res)
      const generated = parseSunoGenerateClips(body)
      if (!generated.length) {
        message.error(t('music.generateFail'))
        return
      }
      const createdAt = Date.now()
      const sceneLabel = t('music.toolsConcat')
      const rows = rowsFromGeneratedClips(generated, {
        idPrefix: 'concat',
        createdAt,
        sceneLabel,
        dualVariant: false,
        title: generated[0]?.id ? `Concat ${generated[0].id.slice(0, 8)}` : 'Concat',
      })
      const entries = rows.map(r => ({
        localId: r.id,
        clipId: r.clipId,
        sceneLabel,
        createdAt,
      }))
      prependClips(rows)
      activeClipId.value = entries[0]?.clipId
      void pollClipGroup(model, entries)
      void syncJobsToCloud()
    } catch (e: unknown) {
      message.error(formatSunoMusicError(e, 'music.generateFail'))
    } finally {
      releaseSubmitLock()
    }
    return
  }

  if (form.value.primaryTab === 'tools' && form.value.toolsMode === 'persona') {
    const root = form.value.personaRootClipId.trim()
    if (!root) {
      message.warning(t('music.personaRootRequired'))
      return
    }
    const rootClip = clips.value.find(c => c.clipId === root)
    if (rootClip && !canCreatePersonaFromClip(rootClip)) {
      message.warning(t('music.limitPersonaUploadClip'))
      return
    }
    if (!form.value.personaName.trim()) {
      message.warning(t('music.personaNameRequired'))
      return
    }
    if (!tryAcquireSubmitLock()) return
    try {
      const res = await sunoPersonaCreateAPI({
        model,
        root_clip_id: root,
        name: form.value.personaName.trim(),
        description: form.value.personaDescription.trim(),
        clips: [root],
        is_public: form.value.personaIsPublic,
      })
      const body = unwrapApiData<Record<string, unknown>>(res)
      const personaId = String(body?.id ?? body?.persona_id ?? '').trim()
      if (!personaId) {
        message.error(t('music.personaCreateFail'))
        return
      }
      try {
        localStorage.setItem(STORAGE_KEY_MUSIC_PERSONA_ID, personaId)
      } catch {
        /* ignore */
      }
      form.value = { ...form.value, personaId }
      message.success(t('music.personaCreateOk'))
    } catch (e: unknown) {
      message.error(formatSunoMusicError(e, 'music.personaCreateFail'))
    } finally {
      releaseSubmitLock()
    }
    return
  }

  if (form.value.primaryTab === 'tools') return

  if (
    form.value.primaryTab === 'process' &&
    (form.value.processMode === 'vocal_stems' || form.value.processMode === 'all_stems')
  ) {
    const targetId = form.value.targetClipId.trim()
    if (!targetId) {
      message.warning(t('music.targetClipPlaceholder'))
      return
    }
    const source = clips.value.find(c => c.clipId === targetId && !c.parentClipId)
    if (!source) {
      message.warning(t('music.stemNeedComplete'))
      return
    }
    stemModalSource.value = source
    stemModalVisible.value = true
    await submitStemSeparation(source, form.value.processMode)
    return
  }

  if (isVocalCreateForm(form.value) && form.value.useLyricsFirst) {
    const theme = lyricsThemeFromForm(form.value)
    if (!form.value.prompt.trim()) {
      if (!theme) {
        message.warning(t('music.lyricsThemeRequired'))
        return
      }
      if (!tryAcquireSubmitLock()) return
      try {
        await ensureLyricsReady(model, theme)
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : String((e as { message?: string })?.message || e)
        message.error(msg || t('music.lyricsFail'))
        releaseSubmitLock()
        return
      }
    }
    if (!form.value.prompt.trim()) {
      message.warning(t('music.lyricsRequiredBeforeMusic'))
      if (submitSyncLock) releaseSubmitLock()
      return
    }
  }

  if (!submitSyncLock && !tryAcquireSubmitLock()) return

  persistPrefs()
  const musicForm = formForMusicGeneration(form.value)
  const sceneLabel = sunoSceneLabelForForm(musicForm)
  const clipCtx = resolveFormClipContext()
  const payload = buildSunoGeneratePayload(musicForm, clipCtx)
  const chargeMult = sunoChargeMultForForm(musicForm)

  try {
    const res = await sunoGenerateAPI({ model, payload, chargeMult })
    const body = unwrapApiData<Record<string, unknown>>(res)
    const generated = parseSunoGenerateClips(body)
    const genTaskId = taskIdFromGenerateBody(body)
    if (!generated.length) {
      message.error(t('music.generateFail'))
      return
    }
    const createdAt = Date.now()
    const rows = rowsFromGeneratedClips(generated, {
      idPrefix: 'job',
      createdAt,
      sceneLabel,
      taskId: genTaskId,
      title: form.value.title || form.value.gptDescriptionPrompt.slice(0, 32) || undefined,
      tags: form.value.tags,
      lyricsText: form.value.prompt.trim() || undefined,
      provenance: clipCreationProvenance(chargeMult),
    })
    prependClips(rows)
    const entries = rows.map(r => ({
      localId: r.id,
      clipId: r.clipId,
      sceneLabel,
      createdAt,
    }))
    activeClipId.value = entries[0]?.clipId
    void pollClipGroup(model, entries)
    void syncJobsToCloud()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message || e)
    message.error(msg || t('music.generateFail'))
  } finally {
    releaseSubmitLock()
  }
}

async function handleExpandTags() {
  if (tagsExpanding.value) return
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (!form.value.tags.trim()) return
  expandedTags.value = ''
  tagsExpanding.value = true
  try {
    const res = await sunoExpandTagsAPI(model, form.value.tags.trim())
    const body = unwrapApiData<{ upsampled_tags?: string; tags?: string }>(res)
    const next = (body?.upsampled_tags || body?.tags || '').trim()
    expandedTags.value = next
    if (next && form.value.primaryTab !== 'tools') {
      form.value = { ...form.value, tags: next }
    }
    if (next) {
      message.success(t('music.tagsExpandOk'))
    } else {
      message.warning(t('music.tagsExpandEmpty'))
    }
  } catch (e: unknown) {
    message.error(formatSunoMusicError(e, 'music.tagsExpandFail'))
  } finally {
    tagsExpanding.value = false
  }
}

async function handleUploadFile(file: File) {
  const model = selectedModelKey.value.trim()
  if (!authStore.isLogin) {
    message.warning(t('music.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  const localId = `upload-${Date.now()}`
  const sceneLabel = t('music.uploadSceneLabel')
  const title = file.name.replace(/\.[^.]+$/, '') || file.name
  uploadFileName.value = file.name
  uploading.value = true
  uploadMode.value = 'file'
  uploadError.value = ''
  uploadErrorKind.value = ''
  reportUploadProgress({
    phase: 'preparing',
    percent: musicUploadPreparingPercent(),
    totalBytes: file.size,
    loadedBytes: 0,
    bytesPerSecond: 0,
  })
  lastUploadClipId.value = ''
  clips.value = [
    {
      id: localId,
      clipId: '',
      title,
      status: 'submitted',
      sceneLabel,
      isUploadClip: true,
      createdAt: Date.now(),
    },
    ...clips.value.filter(c => c.id !== localId),
  ]
  activeClipId.value = localId
  if (file.size > SUNO_UPLOAD_MAX_FILE_BYTES) {
    const errText = t('music.errorUploadFileTooLarge', { mb: formatUploadMaxFileMb() })
    setUploadFailure(errText, 'size')
    updateClipLocal(localId, { status: 'error' })
    message.error(errText)
    uploading.value = false
    uploadMode.value = null
    clearUploadProgress()
    return
  }
  const stopAnalyzeTicker = createMusicUploadAnalyzeTicker(reportUploadProgress, file.size)
  const durationPromise = readAudioDurationSec(file).catch(() => ({ timedOut: true as const }))
  await new Promise<void>(resolve => {
    window.setTimeout(resolve, 350)
  })
  stopAnalyzeTicker()

  const speedTracker = new MusicUploadSpeedTracker()
  speedTracker.reset()
  reportUploadProgress({
    phase: 'transfer',
    percent: musicUploadAnalyzingPercent(8000),
    totalBytes: file.size,
    loadedBytes: 0,
    bytesPerSecond: 0,
  })
  let lastPct = musicUploadAnalyzingPercent(8000)
  let processingTicker: ReturnType<typeof setInterval> | undefined
  const stopProcessingTicker = () => {
    if (processingTicker) {
      clearInterval(processingTicker)
      processingTicker = undefined
    }
  }
  const startProcessingTicker = () => {
    stopProcessingTicker()
    processingTicker = setInterval(() => {
      lastPct = musicUploadProcessingTickPercent(lastPct)
      reportUploadProgress({
        phase: 'processing',
        percent: lastPct,
        totalBytes: file.size,
        loadedBytes: file.size,
        bytesPerSecond: 0,
      })
    }, 450)
  }

  let durationSec: number | undefined
  let durationTimedOut = false
  try {
    const uploadPromise = sunoUploadAudioSmart(model, file, (loaded, total) => {
      stopProcessingTicker()
      const stats = speedTracker.sample(loaded, total)
      const pct = musicUploadTransferPercent(loaded, total)
      lastPct = pct
      reportUploadProgress({
        phase: 'transfer',
        percent: pct,
        ...stats,
      })
      if (total > 0 && loaded >= total) startProcessingTicker()
    })

    const durationResult = await Promise.race([
      durationPromise,
      new Promise<{ timedOut: true }>(resolve =>
        setTimeout(() => resolve({ timedOut: true }), 4000)
      ),
    ])
    if ('timedOut' in durationResult && durationResult.timedOut) {
      durationTimedOut = true
    } else if ('durationSec' in durationResult) {
      durationSec = durationResult.durationSec
      durationTimedOut = Boolean(durationResult.timedOut)
    }
    if (durationTimedOut) {
      message.warning(t('music.uploadDurationSkip'))
    }
    const uploadCheck =
      durationSec != null
        ? checkUploadDurationForMv(durationSec, form.value.mv)
        : { ok: true as const }
    if (!uploadCheck.ok) {
      const errText =
        uploadCheck.reason === 'hard_max'
          ? t('music.uploadHardMax', { sec: uploadCheck.sec, limit: uploadCheck.limitSec })
          : t('music.uploadMvExceeds', {
              sec: uploadCheck.sec,
              limit: uploadCheck.limitSec,
              mv: form.value.mv,
            })
      uploadError.value = errText
      uploadErrorKind.value = ''
      updateClipLocal(localId, { status: 'error', duration: durationSec })
      message.error(errText)
      throw new Error(errText)
    }
    if (uploadCheck.ok && uploadCheck.warn === 'url_doc_exceed' && durationSec != null) {
      message.warning(
        t('music.uploadUrlDocWarn', {
          sec: Math.ceil(durationSec),
          doc: 120,
          limit: formatUploadDurationLimitSec(form.value.mv),
        })
      )
    }

    const res = await uploadPromise
    stopProcessingTicker()
    reportUploadProgress({
      phase: 'processing',
      percent: musicUploadProcessingPercent(),
      totalBytes: file.size,
      loadedBytes: file.size,
      bytesPerSecond: 0,
    })
    const token = parseUploadClipIdOrThrow(res)
    const clipId = await resolveUploadClipId(model, token, round => {
      reportUploadProgress({
        phase: 'polling',
        percent: musicUploadPollingPercent(round),
      })
    })
    if (!clipId) {
      throw new Error(t('music.uploadFail'))
    }
    reportUploadProgress({ phase: 'polling', percent: musicUploadDonePercent() })
    await applyClipAfterUpload(clipId, { fileName: file.name, keepTab: true, localId })
  } catch (e: unknown) {
    stopProcessingTicker()
    const errText = formatSunoMusicError(e, 'music.uploadFail')
    uploadError.value = errText
    uploadErrorKind.value = sunoMusicErrorKind(e)
    updateClipLocal(localId, { status: 'error' })
    message.error(errText)
  } finally {
    uploading.value = false
    uploadMode.value = null
    clearUploadProgress()
  }
}

async function handleUploadUrl(url: string) {
  const model = selectedModelKey.value.trim()
  if (!authStore.isLogin) {
    message.warning(t('music.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  const audioUrl = url.trim()
  if (!audioUrl) return
  uploading.value = true
  uploadMode.value = 'url'
  lastUploadClipId.value = ''
  uploadError.value = ''
  uploadErrorKind.value = ''
  reportUploadProgress({ phase: 'preparing', percent: musicUploadPreparingPercent() })
  try {
    reportUploadProgress({ phase: 'processing', percent: 30 })
    const res = await sunoUploadByUrlAPI(model, audioUrl)
    reportUploadProgress({ phase: 'processing', percent: musicUploadProcessingPercent() })
    const token = parseUploadClipIdOrThrow(res)
    const clipId = await resolveUploadClipId(model, token, round => {
      reportUploadProgress({
        phase: 'polling',
        percent: musicUploadPollingPercent(round),
      })
    })
    if (!clipId) {
      message.error(t('music.uploadFail'))
      return
    }
    reportUploadProgress({ phase: 'polling', percent: musicUploadDonePercent() })
    await applyClipAfterUpload(clipId, { keepTab: true })
    form.value = { ...form.value, uploadAudioUrl: '' }
  } catch (e: unknown) {
    const errText = formatSunoMusicError(e, 'music.uploadFail')
    uploadError.value = errText
    uploadErrorKind.value = sunoMusicErrorKind(e)
    message.error(errText)
  } finally {
    uploading.value = false
    uploadMode.value = null
    clearUploadProgress()
  }
}

function onUploadGoEdit(mode: MusicEditMode = 'extend') {
  if (!lastUploadClipId.value) return
  form.value = {
    ...form.value,
    primaryTab: 'edit',
    editMode: mode,
    targetClipId: lastUploadClipId.value,
    sourceIsUpload: true,
    mv: resolveSunoMvForEditMode(mode, form.value.mv, form.value.editMode),
  }
  activeClipId.value = lastUploadClipId.value
}

function focusMusicSidebar(hintKey?: string) {
  sidebarFocusToken.value += 1
  void nextTick(() => {
    sidebarRef.value?.scrollIntoView()
  })
  if (hintKey) message.success(t(hintKey))
}

function prefillClipIntoForm(clip: MusicClipItem): Partial<MusicFormState> {
  const end = clip.duration != null ? clip.duration : null
  const continueAt = end != null ? Math.max(0, Math.floor(end - 1)) : form.value.continueAt
  return {
    targetClipId: clip.clipId,
    sourceIsUpload: clip.isUploadClip ?? form.value.sourceIsUpload,
    tags: clip.tags || form.value.tags,
    title: clip.title || form.value.title,
    prompt: clip.lyricsText?.trim() || form.value.prompt,
    continueAt,
    overpaintingStartS: 0,
    overpaintingEndS: end ?? form.value.overpaintingEndS,
    underpaintingStartS: 0,
    underpaintingEndS: end ?? form.value.underpaintingEndS,
    infillEndS: end ?? form.value.infillEndS,
  }
}

function onUseAsTarget(clip: MusicClipItem) {
  form.value = {
    ...form.value,
    ...prefillClipIntoForm(clip),
    primaryTab: 'edit',
    mv: resolveSunoMvForEditMode(form.value.editMode, form.value.mv),
  }
  activeClipId.value = clip.clipId
  focusMusicSidebar('music.actionHintUseAsTarget')
}

function onChainEdit(clip: MusicClipItem, mode: MusicEditMode) {
  if (mode === 'persona_sing' && !canUsePersonaSing(clip)) {
    message.warning(t('music.limitPersonaUploadClip'))
    return
  }
  form.value = {
    ...form.value,
    primaryTab: 'edit',
    editMode: mode,
    mv: resolveSunoMvForEditMode(mode, form.value.mv, form.value.editMode),
    audioWeight: mode === 'cover' ? (form.value.audioWeight ?? 0.5) : form.value.audioWeight,
    ...prefillClipIntoForm(clip),
  }
  activeClipId.value = clip.clipId
  focusMusicSidebar(MUSIC_EDIT_MODE_HINT_KEYS[mode])
}

function onOpenWizard(clip?: MusicClipItem) {
  if (clip) activeClipId.value = clip.clipId
  wizardVisible.value = true
}

async function handleWizardExtend(payload: {
  sourceClipId: string
  continueAt: number
  prompt: string
  tags: string
  title: string
  mv: SunoModelVersion
}) {
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (!tryAcquireSubmitLock()) return
  try {
    const sourceCtx = resolveClipContext(payload.sourceClipId, clips.value)
    const body: Record<string, unknown> = {
      task: sourceCtx?.isUpload ? 'upload_extend' : 'extend',
      continue_clip_id: payload.sourceClipId,
      continue_at: payload.continueAt,
      prompt: payload.prompt,
      tags: payload.tags,
      title: payload.title,
      mv: payload.mv,
      make_instrumental: false,
    }
    if (sourceCtx?.taskId) body.task_id = sourceCtx.taskId
    const res = await sunoGenerateAPI({ model, payload: body })
    const data = unwrapApiData<Record<string, unknown>>(res)
    const genTaskId = taskIdFromGenerateBody(data)
    const generated = parseSunoGenerateClips(data)
    if (!generated.length) {
      message.error(t('music.generateFail'))
      return
    }
    const createdAt = Date.now()
    const sceneLabel = t('music.wizardExtendScene')
    const rows = rowsFromGeneratedClips(generated, {
      idPrefix: 'wiz-ext',
      createdAt,
      sceneLabel,
      taskId: genTaskId,
      title: payload.title,
    })
    prependClips(rows)
    const entries = rows.map(r => ({
      localId: r.id,
      clipId: r.clipId,
      sceneLabel,
      createdAt,
    }))
    wizardWatchClipIds.value = rows.map(r => r.clipId).filter(Boolean)
    wizardRef.value?.notifyExtendSubmitted(rows.map(r => r.clipId).filter(Boolean))
    void pollClipGroup(model, entries)
  } catch (e: unknown) {
    message.error(formatSunoMusicError(e, 'music.generateFail'))
  } finally {
    releaseSubmitLock()
  }
}

async function handleWizardConcat(payload: { extendedClipId: string; isInfill: boolean }) {
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (!tryAcquireSubmitLock()) return
  try {
    const res = await sunoConcatAPI(model, payload.extendedClipId, payload.isInfill)
    const body = unwrapApiData<Record<string, unknown>>(res)
    const genTaskId = taskIdFromGenerateBody(body)
    const generated = parseSunoGenerateClips(body)
    if (!generated.length) {
      message.error(t('music.generateFail'))
      return
    }
    const createdAt = Date.now()
    const sceneLabel = t('music.wizardConcatScene')
    const rows = rowsFromGeneratedClips(generated, {
      idPrefix: 'wiz-cat',
      createdAt,
      sceneLabel,
      taskId: genTaskId,
      dualVariant: false,
      title: generated[0]?.id ? `Full ${generated[0].id.slice(0, 8)}` : 'Full',
    })
    prependClips(rows)
    const entries = rows.map(r => ({
      localId: r.id,
      clipId: r.clipId,
      sceneLabel,
      createdAt,
    }))
    activeClipId.value = entries[0]?.clipId
    void pollClipGroup(model, entries)
    wizardVisible.value = false
    wizardWatchClipIds.value = []
    message.success(t('music.wizardConcatOk'))
  } catch (e: unknown) {
    message.error(formatSunoMusicError(e, 'music.generateFail'))
  } finally {
    releaseSubmitLock()
  }
}

function persistMusicStudioState() {
  if (!clipsHydrated.value) return
  const userId = authStore.userInfo?.id
  const snapClips =
    clips.value.length > 0 ? clips.value : mergeMusicClipLists(loadMusicClipsCache(userId))
  saveMusicStudioSnapshot({
    form: form.value,
    selectedModelKey: selectedModelKey.value,
    activeClipId: activeClipId.value,
    playingClipId: playingClipId.value,
    clips: snapClips,
  })
  if (clips.value.length) saveMusicClipsCache(clips.value, userId)
}

function tryRestoreMusicStudio(): boolean {
  if (!shouldRestoreMusicStudio()) return false
  const snap = loadMusicStudioSnapshot()
  clearRestoreMusicStudioFlag()
  if (!snap) return false
  form.value = {
    ...defaultForm(),
    ...snap.form,
    mv: upgradeLegacyImplicitSunoMv(normalizeSunoModelVersion(snap.form.mv)),
    audioWeight: snap.form.audioWeight ?? 0.5,
  }
  if (snap.selectedModelKey) selectedModelKey.value = snap.selectedModelKey
  if (snap.clips?.length) clips.value = snap.clips
  activeClipId.value = snap.activeClipId
  playingClipId.value = snap.playingClipId
  return true
}

function onOpenStemModal(clip: MusicClipItem) {
  if (clip.status !== 'complete') {
    message.warning(t('music.stemNeedComplete'))
    return
  }
  stemModalSource.value = clip
  stemModalVisible.value = true
  activeClipId.value = clip.clipId
}

async function submitStemSeparation(source: MusicClipItem, mode: 'vocal_stems' | 'all_stems') {
  if (!authStore.isLogin) {
    message.warning(t('music.loginRequired'))
    authStore.setLoginDialog(true)
    return
  }
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (source.status !== 'complete' || !source.clipId) {
    message.warning(t('music.stemNeedComplete'))
    return
  }

  stemSubmitting.value = true
  const sceneLabel = stemSceneLabel(mode)
  const stemGroupId = `stem-${Date.now()}`
  const stemCtx = resolveClipContext(source.clipId, clips.value)
  const payload = buildStemSeparationPayload(source.clipId, mode, form.value.mv, stemCtx)
  const chargeMult = stemChargeMult(mode)

  try {
    const res = await sunoGenerateAPI({ model, payload, chargeMult })
    const body = unwrapApiData<Record<string, unknown>>(res)
    const generated = parseSunoGenerateClips(body)
    if (!generated.length) {
      message.error(t('music.generateFail'))
      return
    }
    const createdAt = Date.now()
    const stemProv = clipCreationProvenance(chargeMult)
    const entries = generated.map((g, idx) => {
      const localId = `${stemGroupId}-${idx}`
      const row = attachClipCreationProvenance(
        {
          id: localId,
          clipId: g.id,
          title: '',
          status: g.status,
          parentClipId: source.clipId,
          stemGroupId,
          sceneLabel,
          createdAt,
        },
        stemProv,
        idx
      )
      clips.value = [row, ...clips.value.filter(c => c.id !== localId)]
      return { localId, clipId: g.id, sceneLabel, createdAt }
    })
    void pollClipGroup(model, entries, {
      parentClipId: source.clipId,
      stemGroupId,
      sceneLabel,
    })
    void syncJobsToCloud()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message || e)
    message.error(msg || t('music.generateFail'))
  } finally {
    stemSubmitting.value = false
  }
}

async function onStemModalSubmit(mode: MusicProcessMode) {
  if (mode !== 'vocal_stems' && mode !== 'all_stems') return
  const source = stemModalSource.value
  if (!source) return
  await submitStemSeparation(source, mode)
}

function onChainProcess(clip: MusicClipItem, mode: MusicProcessMode) {
  if (mode === 'midi') {
    void onExportMidi(clip)
    return
  }
  if (mode === 'vocal_stems' || mode === 'all_stems') {
    onOpenStemModal(clip)
    if (mode === 'vocal_stems') {
      message.info(t('music.actionHintVocalStems'))
    } else {
      message.info(t('music.actionHintAllStems'))
    }
    return
  }
  form.value = {
    ...form.value,
    primaryTab: 'process',
    processMode: mode,
    ...prefillClipIntoForm(clip),
  }
  activeClipId.value = clip.clipId
  focusMusicSidebar(MUSIC_PROCESS_MODE_HINT_KEYS[mode])
}

function onCopyClipId(id: string) {
  copyText({ text: id })
  message.success(t('music.copied'))
}

async function onDeleteJob(clip: MusicClipItem) {
  if (!window.confirm(t('music.deleteJobConfirm'))) return
  if (clip.serverJobId) {
    try {
      await deleteSunoMusicJobAPI(clip.serverJobId)
    } catch (e: unknown) {
      message.error(formatSunoMusicError(e, 'music.deleteJobFail'))
      return
    }
  }
  const clipId = clip.clipId
  clips.value = clips.value.filter(c => c.clipId !== clipId && c.parentClipId !== clipId)
  if (activeClipId.value === clipId) activeClipId.value = undefined
  if (playingClipId.value === clipId) playingClipId.value = undefined
  message.success(t('music.deleteJobOk'))
  persistMusicStudioState()
  void syncJobsToCloud()
}

async function enrichClipForDetail(clip: MusicClipItem) {
  const model = selectedModelKey.value.trim()
  if (!model || !clip.clipId) return
  const needsFeed = !clip.sunoMv && !clip.sunoModelName && !clip.majorModelVersion && !clip.modelKey
  const needsBilling = clip.deductCharged == null
  if (!needsFeed && !needsBilling) return
  try {
    const feedRes = await sunoFeedAPI(model, clip.clipId, { silent: true })
    const feedClips = parseSunoFeedClips(unwrapApiData(feedRes))
    const fc = feedClips.find(f => String(f.id ?? '').trim() === clip.clipId) ?? feedClips[0]
    if (!fc) return
    const fromFeed = feedClipToMusicItem(fc, {
      localId: clip.id,
      sceneLabel: clip.sceneLabel,
      createdAt: clip.createdAt,
      lyricsText: clip.lyricsText,
    })
    const patch: Partial<MusicClipItem> = {
      modelKey: clip.modelKey || selectedModelKey.value,
      sunoMv: clip.sunoMv || fromFeed.sunoMv,
      sunoModelName: fromFeed.sunoModelName ?? clip.sunoModelName,
      majorModelVersion: fromFeed.majorModelVersion ?? clip.majorModelVersion,
      gptDescriptionPrompt: fromFeed.gptDescriptionPrompt ?? clip.gptDescriptionPrompt,
      negativeTags: fromFeed.negativeTags ?? clip.negativeTags,
      styleWeight: fromFeed.styleWeight ?? clip.styleWeight,
      weirdnessConstraint: fromFeed.weirdnessConstraint ?? clip.weirdnessConstraint,
      vocalGender: fromFeed.vocalGender ?? clip.vocalGender,
      audioWeight: fromFeed.audioWeight ?? clip.audioWeight,
      tags: fromFeed.tags ?? clip.tags,
      lyricsText: fromFeed.lyricsText ?? clip.lyricsText,
      videoUrl: fromFeed.videoUrl ?? clip.videoUrl,
    }
    updateClipLocal(clip.id, patch)
    if (clipDetailClip.value?.id === clip.id) {
      clipDetailClip.value = { ...(clipDetailClip.value ?? clip), ...patch }
    }
    void syncJobsToCloud()
  } catch {
    /* ignore */
  }
}

function onOpenClipDetail(clip: MusicClipItem) {
  clipDetailClip.value = clips.value.find(c => c.id === clip.id) ?? clip
  clipDetailVisible.value = true
  activeClipId.value = clip.clipId
  void enrichClipForDetail(clipDetailClip.value)
}

function onSelectDetailSibling(clip: MusicClipItem) {
  clipDetailClip.value = clips.value.find(c => c.id === clip.id) ?? clip
  activeClipId.value = clip.clipId
  void enrichClipForDetail(clipDetailClip.value)
}

function onOpenDetailSource(clip: MusicClipItem) {
  clipDetailClip.value = clips.value.find(c => c.id === clip.id) ?? clip
  activeClipId.value = clip.clipId
  void enrichClipForDetail(clipDetailClip.value)
}

function onOpenLyricsFromDetail(clip: MusicClipItem) {
  clipDetailVisible.value = false
  void onOpenLyrics(clip)
}

function onDownload(clip: MusicClipItem) {
  if (!clip.audioUrl) return
  window.open(clip.audioUrl, '_blank')
}

async function onExportWav(clip: MusicClipItem) {
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (detailActionBusy.value) return
  detailActionBusy.value = 'wav'
  exportBusy.value = true
  exportResultKind.value = 'wav'
  exportResultTitle.value = clip.title || clip.clipId
  exportResultUrl.value = ''
  exportResultLoading.value = true
  exportResultVisible.value = true
  try {
    const url = await pollWavUrl(() =>
      sunoGetWavAPI(model, clip.clipId).then(res => unwrapApiData(res))
    )
    exportResultUrl.value = url
  } catch (e: unknown) {
    exportResultVisible.value = false
    const msg = e instanceof Error ? e.message : ''
    message.error(msg === 'export_timeout' ? t('music.exportPending') : t('music.generateFail'))
  } finally {
    exportResultLoading.value = false
    exportBusy.value = false
    detailActionBusy.value = null
  }
}

async function onExportMp4(clip: MusicClipItem) {
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (detailActionBusy.value) return
  detailActionBusy.value = 'mp4'
  exportBusy.value = true
  exportResultKind.value = 'mp4'
  exportResultTitle.value = clip.title || clip.clipId
  exportResultUrl.value = ''
  exportResultLoading.value = true
  exportResultVisible.value = true
  try {
    const url = await pollMp4Url(() =>
      sunoGetMp4API(model, clip.clipId).then(res => unwrapApiData(res))
    )
    exportResultUrl.value = url
  } catch (e: unknown) {
    exportResultVisible.value = false
    const msg = e instanceof Error ? e.message : ''
    message.error(msg === 'export_timeout' ? t('music.exportPending') : t('music.generateFail'))
  } finally {
    exportResultLoading.value = false
    exportBusy.value = false
    detailActionBusy.value = null
  }
}

async function onExportMidi(clip: MusicClipItem) {
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (detailActionBusy.value) return
  detailActionBusy.value = 'midi'
  if (clip.midiState === 'complete' && clip.midiData) {
    midiModalData.value = clip.midiData
    midiModalTitle.value = clip.title || clip.clipId
    midiModalClipId.value = clip.clipId
    midiModalLoading.value = false
    midiModalVisible.value = true
    detailActionBusy.value = null
    return
  }
  midiModalTitle.value = clip.title || clip.clipId
  midiModalClipId.value = clip.clipId
  midiModalData.value = null
  midiModalLoading.value = true
  midiModalVisible.value = true
  try {
    const data = await pollMidiComplete(() =>
      sunoGetMidiAPI(model, clip.clipId).then(res => unwrapApiData(res))
    )
    midiModalData.value = data
    const ix = clips.value.findIndex(c => c.clipId === clip.clipId)
    if (ix >= 0) {
      clips.value[ix] = {
        ...clips.value[ix],
        midiState: 'complete',
        midiData: data,
      }
    }
    persistMusicStudioState()
  } catch {
    message.warning(t('music.pollTimeout'))
    midiModalVisible.value = false
  } finally {
    midiModalLoading.value = false
    detailActionBusy.value = null
  }
}

function onMidiDownload() {
  if (!midiModalData.value) return
  const name = (midiModalTitle.value || midiModalClipId.value || 'midi').replace(
    /[^\w\u4e00-\u9fa5-]+/g,
    '_'
  )
  downloadJsonFile(midiModalData.value, `${name}.midi.json`)
}

function onExportVox(clip: MusicClipItem) {
  if (clip.status !== 'complete') {
    message.warning(t('music.stemNeedComplete'))
    return
  }
  voxModalClip.value = clip
  voxModalUrl.value = ''
  voxModalVisible.value = true
}

async function onVoxSubmit(payload: { vocal_start_s: number; vocal_end_s: number }) {
  const clip = voxModalClip.value
  const model = selectedModelKey.value.trim()
  if (!clip || !model) {
    message.warning(t('music.needModel'))
    return
  }
  voxSubmitting.value = true
  voxModalUrl.value = ''
  try {
    const res = await sunoGetVoxAPI(model, clip.clipId, payload.vocal_start_s, payload.vocal_end_s)
    const body = unwrapApiData<Record<string, unknown>>(res)
    const url = String(body?.vocal_audio_url ?? '').trim()
    if (!url) {
      message.warning(t('music.exportPending'))
      return
    }
    voxModalUrl.value = url
    message.success(t('music.voxOk'))
  } catch (e: unknown) {
    message.error(formatSunoMusicError(e, 'music.generateFail'))
  } finally {
    voxSubmitting.value = false
  }
}

async function onOpenLyrics(clip: MusicClipItem) {
  if (clip.status !== 'complete' || !clip.audioUrl) return
  const model = selectedModelKey.value.trim()
  detailActionBusy.value = 'lyrics'
  let playerClip = clip
  if (!clip.lyricsText?.trim() && model) {
    try {
      const feedRes = await sunoFeedAPI(model, clip.clipId, { silent: true })
      const feedClips = parseSunoFeedClips(unwrapApiData(feedRes))
      const fc = feedClips.find(c => String(c.id) === clip.clipId) ?? feedClips[0]
      if (fc) {
        const item = feedClipToMusicItem(fc, {
          localId: clip.id,
          sceneLabel: clip.sceneLabel,
          createdAt: clip.createdAt,
          lyricsText: clip.lyricsText,
        })
        if (item.lyricsText?.trim()) {
          updateClipLocal(clip.id, { lyricsText: item.lyricsText })
          playerClip = { ...clip, lyricsText: item.lyricsText }
        }
      }
    } catch {
      /* 无 feed 歌词时仍打开播放器 */
    }
  }
  lyricsPlayerClip.value = playerClip
  lyricsPlayerVisible.value = true
  activeClipId.value = clip.clipId
  playingClipId.value = clip.clipId
  lyricsTimingLoading.value = true
  lyricsTimingData.value = null
  if (!model) {
    lyricsTimingLoading.value = false
    detailActionBusy.value = null
    return
  }
  try {
    const res = await sunoGetTimingAPI(model, clip.clipId)
    lyricsTimingData.value = unwrapApiData(res)
  } catch {
    /* 无 timing 时歌词播放器回退静态 prompt */
  } finally {
    lyricsTimingLoading.value = false
    detailActionBusy.value = null
  }
}

async function onExportTiming(clip: MusicClipItem) {
  const model = selectedModelKey.value.trim()
  if (!model) {
    message.warning(t('music.needModel'))
    return
  }
  if (detailActionBusy.value) return
  detailActionBusy.value = 'timing'
  try {
    message.info(t('music.exportTimingPolling'))
    const res = await sunoGetTimingAPI(model, clip.clipId)
    timingModalData.value = unwrapApiData(res)
    timingModalTitle.value = clip.title || clip.clipId
    timingModalVisible.value = true
  } catch (e: unknown) {
    message.error(formatSunoMusicError(e, 'music.generateFail'))
  } finally {
    detailActionBusy.value = null
  }
}

function onConcatClip(clip: MusicClipItem) {
  form.value = {
    ...form.value,
    primaryTab: 'tools',
    toolsMode: 'concat',
    concatClipId: clip.clipId,
    ...prefillClipIntoForm(clip),
  }
  activeClipId.value = clip.clipId
  focusMusicSidebar('music.actionHintConcat')
}

async function loadMusicModels() {
  modelsLoading.value = true
  try {
    const res = (await fetchMusicModelsListAPI()) as {
      success?: boolean
      data?: { list: SunoMusicModel[] }
    }
    if (res.success && res.data?.list?.length) {
      musicModels.value = res.data.list
      const preferred = loadStoredModelKey()
      if (preferred && res.data.list.some(m => m.model === preferred)) {
        selectedModelKey.value = preferred
      } else {
        selectedModelKey.value = res.data.list[0].model
      }
    }
  } catch {
    /* ignore */
  } finally {
    modelsLoading.value = false
  }
}

async function loadCloudJobs() {
  await hydrateMusicClipsFromCloud()
}

onBeforeRouteLeave(to => {
  if (to.name === 'Drawing') persistMusicStudioState()
})

watch(
  [form, selectedModelKey, clips, activeClipId],
  () => {
    if (clipsHydrated.value) persistMusicStudioState()
  },
  { deep: true }
)

watch(
  clips,
  () => {
    if (!wizardVisible.value || !wizardWatchClipIds.value.length) return
    const ids = wizardWatchClipIds.value
    const allTerminal = ids.every(id => {
      const c = clips.value.find(x => x.clipId === id)
      return c && isClipGenerationSettled(c)
    })
    if (!allTerminal) return
    const completed = clips.value.find(c => ids.includes(c.clipId) && isClipPlaybackReady(c))
    if (completed) wizardRef.value?.notifyExtendComplete(completed.clipId)
  },
  { deep: true }
)

onMounted(async () => {
  const restored = tryRestoreMusicStudio()
  if (!restored) {
    form.value.mv = loadStoredSunoMv()
  }

  void loadMusicModels()
  loadPersistedClipsOnBoot(authStore.userInfo?.id)

  if (authStore.isLogin) {
    try {
      await authStore.getUserInfo()
    } catch {
      /* ignore */
    }
    await hydrateMusicClipsFromCloud()
  }

  clipsHydrated.value = true
  const userId = authStore.userInfo?.id
  if (clips.value.length) saveMusicClipsCache(clips.value, userId)
})

watch(
  () => authStore.isLogin,
  async (loggedIn, wasLoggedIn) => {
    if (!clipsHydrated.value) return
    if (loggedIn && !wasLoggedIn) {
      try {
        await authStore.getUserInfo()
      } catch {
        /* ignore */
      }
      await hydrateMusicClipsFromCloud()
      if (clips.value.length) saveMusicClipsCache(clips.value, authStore.userInfo?.id)
      return
    }
    if (!loggedIn && wasLoggedIn) {
      clips.value = []
      clearMusicClipsCache(authStore.userInfo?.id)
    }
  }
)

watch(
  () => authStore.userInfo?.id,
  async (uid, prev) => {
    if (!clipsHydrated.value || !uid) return
    if (prev != null && prev !== uid) {
      clips.value = []
      clearMusicClipsCache(prev)
      await hydrateMusicClipsFromCloud()
      if (clips.value.length) saveMusicClipsCache(clips.value, uid)
    }
  }
)

onUnmounted(() => {
  pollTimers.forEach(t => clearTimeout(t))
  pollTimers.clear()
})
</script>

<template>
  <div class="h-full transition-all">
    <div class="h-full overflow-hidden" :class="getMobileClass">
      <div class="z-40 flex h-full" :class="getContainerClass">
        <Sider class="h-full" />
        <div
          class="music-page relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--music-surface-page)]"
        >
          <HeaderComponent
            class="relative z-10 shrink-0 border-b border-[var(--music-border-subtle)] bg-[var(--music-surface-sidebar)]"
          />

          <main
            class="music-studio relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--music-surface-page)]"
          >
            <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
              <MusicStudioSidebar
                ref="sidebarRef"
                v-model:form="form"
                v-model:selected-model-key="selectedModelKey"
                :sidebar-focus-token="sidebarFocusToken"
                :music-models="musicModels"
                :models-loading="modelsLoading"
                :submitting="submitting"
                :lyrics-generating="lyricsGenerating"
                :tags-expanding="tagsExpanding"
                :expanded-tags="expandedTags"
                :upload-file-name="uploadFileName"
                :uploading="uploading"
                :upload-progress="uploadProgress"
                :upload-mode="uploadMode"
                :upload-error="uploadError"
                :upload-error-kind="uploadErrorKind"
                :last-upload-clip-id="lastUploadClipId"
                :persona-root-blocked="personaRootBlocked"
                @submit="handleSubmit"
                @generate-lyrics="handleGenerateLyrics"
                @expand-tags="handleExpandTags"
                @upload-file="handleUploadFile"
                @upload-url="handleUploadUrl"
                @upload-go-edit="onUploadGoEdit"
                @open-wizard="onOpenWizard()"
              />
              <MusicWorkArea
                class="min-w-0 flex-1"
                :clips="clips"
                :jobs-hydrating="jobsHydrating"
                :active-clip-id="activeClipId"
                :playing-clip-id="playingClipId"
                :detail-action-busy="detailActionBusy"
                :lyrics-player-visible="lyricsPlayerVisible"
                :lyrics-player-clip="lyricsPlayerClip"
                :lyrics-timing-data="lyricsTimingData"
                :lyrics-timing-loading="lyricsTimingLoading"
                @select="c => (activeClipId = c.clipId)"
                @play="c => (playingClipId = c.clipId)"
                @pause="playingClipId = undefined"
                @close-lyrics="lyricsPlayerVisible = false"
                @use-as-target="onUseAsTarget"
                @chain-edit="onChainEdit"
                @chain-process="onChainProcess"
                @open-stem="onOpenStemModal"
                @download="onDownload"
                @copy-clip-id="onCopyClipId"
                @delete-job="onDeleteJob"
                @export-wav="onExportWav"
                @export-mp4="onExportMp4"
                @export-timing="onExportTiming"
                @export-midi="onExportMidi"
                @export-vox="onExportVox"
                @open-lyrics="onOpenLyrics"
                @concat-clip="onConcatClip"
                @open-wizard="onOpenWizard"
                @open-detail="onOpenClipDetail"
              />
            </div>
          </main>
        </div>
      </div>
    </div>
    <div class="overflow-hidden">
      <MusicClipDetailModal
        :visible="clipDetailVisible"
        :clip="clipDetailClip"
        :all-clips="clips"
        :music-models="musicModels"
        :playing-clip-id="playingClipId"
        @close="clipDetailVisible = false"
        @play="c => (playingClipId = c.clipId)"
        @open-lyrics="onOpenLyricsFromDetail"
        @download="onDownload"
        @select-sibling="onSelectDetailSibling"
        @open-source="onOpenDetailSource"
      />
      <MusicExportResultModal
        :visible="exportResultVisible"
        :kind="exportResultKind"
        :clip-title="exportResultTitle"
        :url="exportResultUrl"
        :loading="exportResultLoading"
        @close="exportResultVisible = false"
      />
      <MusicTimingModal
        :visible="timingModalVisible"
        :clip-title="timingModalTitle"
        :timing-data="timingModalData"
        @close="timingModalVisible = false"
      />
      <MusicMidiModal
        :visible="midiModalVisible"
        :clip-title="midiModalTitle"
        :midi-data="midiModalData"
        :loading="midiModalLoading"
        @close="midiModalVisible = false"
        @download="onMidiDownload"
      />
      <MusicVoxModal
        :visible="voxModalVisible"
        :clip-title="voxModalClip?.title"
        :clip-duration="voxModalClip?.duration"
        :submitting="voxSubmitting"
        :result-url="voxModalUrl"
        @close="voxModalVisible = false"
        @submit="onVoxSubmit"
      />
      <MusicStemModal
        :visible="stemModalVisible"
        :source-clip="stemModalSource"
        :stem-clips="stemModalClips"
        :submitting="stemSubmitting"
        :playing-clip-id="playingClipId"
        @close="stemModalVisible = false"
        @submit="onStemModalSubmit"
        @play="c => (playingClipId = c.clipId)"
        @download="onDownload"
        @use-as-target="onUseAsTarget"
      />
      <MusicExtendConcatWizard
        ref="wizardRef"
        :visible="wizardVisible"
        :submitting="submitting"
        :clips="clips"
        :default-source-clip-id="activeClipId || form.targetClipId"
        :default-continue-at="form.continueAt"
        @close="wizardVisible = false"
        @extend="handleWizardExtend"
        @concat="handleWizardConcat"
      />
      <Login :visible="loginDialog" />
      <SettingsDialog v-if="!isMobile" :visible="settingsDialog" />
      <MobileSettingsDialog v-else :visible="mobileSettingsDialog" />
    </div>
  </div>
</template>
