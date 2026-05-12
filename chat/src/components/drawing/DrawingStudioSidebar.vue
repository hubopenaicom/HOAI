<script setup lang="ts">
import DrawingUploadPreviewGrid from '@/components/drawing/DrawingUploadPreviewGrid.vue'
import MjCustomParamsSwitch from '@/components/drawing/MjCustomParamsSwitch.vue'
import MjImagineAdvParams from '@/components/drawing/MjImagineAdvParams.vue'
import { t } from '@/locales'
import type { MjSpeedMode } from '@/api/drawingMj'
import { computed } from 'vue'

export type StudioTab = 't2i' | 'i2i' | 'spell' | 'blend' | 'edits'
export type MjBlendDimensions = 'PORTRAIT' | 'SQUARE' | 'LANDSCAPE'
export type SpellMode = 'describe' | 'shorten'
export type MjStyle = 'realistic' | 'anime'
/** 写实模式下 Midjourney --v 主模型版本 */
export type MjRealisticVersion = '6' | '7' | '8'
/** 动漫模式下 --niji 代数（与写实 --v 独立） */
export type MjNijiVersion = '6' | '7'

interface DrawingOpt {
  modelName: string
  model: string
}

const props = withDefaults(
  defineProps<{
    drawingModels: DrawingOpt[]
    selectedModelKey: string
    modelsLoading: boolean
    studioTab: StudioTab
    spellMode: SpellMode
    mjMode: MjSpeedMode
    mjStyle: MjStyle
    negativePrompt: string
    aspectKey: string
    /** 自定义比例「宽:高」 */
    aspectCustomRatio: string
    /** 当前为自定义且格式不合法 */
    aspectCustomInvalid: boolean
    /** 写实模式下的 --v 版本号 */
    mjRealisticVersion: MjRealisticVersion
    /** 动漫模式下的 --niji 版本号 */
    mjNijiVersion: MjNijiVersion
    /** 可选 --seed，空字符串表示不附加 */
    mjSeed: string
    /** 开启后提交时不自动附加左侧选项里的 --ar / --v / --no 等，由用户在画面描述中手写 */
    customParamsOnly: boolean
    /** 文生图/图生图：主画面描述 */
    promptText: string
    /** 已选参考图预览（data URL 等，与提交列表一致） */
    refImagePreviews: string[]
    /** Blend：已选混合图预览 */
    blendImagePreviews: string[]
    /** Blend：输出比例维度（上游 PORTRAIT / SQUARE / LANDSCAPE） */
    blendDimensions: MjBlendDimensions
    /** Imagine / URL 编辑：高级参数（0 表示不附加） */
    mjParamIw: number
    mjParamStylize: number
    mjParamChaos: number
    mjParamWeird: number
    mjParamStop: number
    /** 0 关；1=.25 … 4=2 */
    mjParamQuality: number
    mjStyleRaw: boolean
    mjRefCrefUrl: string
    mjParamCw: number
    mjRefSrefUrl: string
    mjParamSw: number
    mjParamSv: number
    mjRefOrefUrl: string
    mjParamOw: number
    mjParamTile: boolean
    mjParamDraft: boolean
    /** 写实 V8：--sd / --hd 输出模式 */
    mjV8OutputMode: 'off' | 'sd' | 'hd'
    mjParamRepeat: number
    /** 写实 V7 且存在有效 --oref 时：官方要求勿与 Draft / `--q 4` / Fast&Turbo 同用 */
    mjOrefComboLock?: boolean
    /** 与「AI 绘画」输入区叠在同一左栏时为 true，不占单独 md 宽度、不出现右侧竖线 */
    embedded?: boolean
  }>(),
  {
    embedded: false,
    refImagePreviews: () => [],
    blendImagePreviews: () => [],
    blendDimensions: 'SQUARE',
    mjParamIw: 0,
    mjParamStylize: 0,
    mjParamChaos: 0,
    mjParamWeird: 0,
    mjParamStop: 0,
    mjParamQuality: 0,
    mjStyleRaw: false,
    mjRefCrefUrl: '',
    mjParamCw: 0,
    mjRefSrefUrl: '',
    mjParamSw: 0,
    mjParamSv: 0,
    mjRefOrefUrl: '',
    mjParamOw: 0,
    mjParamTile: false,
    mjParamDraft: false,
    mjV8OutputMode: 'off',
    mjParamRepeat: 0,
    mjOrefComboLock: false,
  }
)

/** 随工作模式切换的折叠说明正文 */
const studioModeHelpBody = computed(() => {
  const tab = props.studioTab
  if (tab === 'spell') {
    return props.spellMode === 'describe'
      ? t('drawing.studioModeHelpBodySpellDescribe')
      : t('drawing.studioModeHelpBodySpellShorten')
  }
  if (tab === 't2i') return t('drawing.studioModeHelpBodyT2i')
  if (tab === 'i2i') return t('drawing.studioModeHelpBodyI2i')
  if (tab === 'blend') return t('drawing.studioModeHelpBodyBlend')
  return t('drawing.studioModeHelpBodyEdits')
})

/** 移动端对纯 `image/*` 兼容性差，补充常见 MIME 与扩展名 */
const mjImageAccept =
  'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp,image/*'

const emit = defineEmits<{
  'update:selectedModelKey': [string]
  'update:studioTab': [StudioTab]
  'update:spellMode': [SpellMode]
  'update:mjMode': [MjSpeedMode]
  'update:mjStyle': [MjStyle]
  'update:negativePrompt': [string]
  'update:aspectKey': [string]
  'update:aspectCustomRatio': [string]
  'update:mjRealisticVersion': [MjRealisticVersion]
  'update:mjNijiVersion': [MjNijiVersion]
  'update:mjSeed': [string]
  'update:customParamsOnly': [boolean]
  'update:promptText': [string]
  'update:blendDimensions': [MjBlendDimensions]
  imagineFiles: [Event]
  blendFiles: [Event]
  removeRefImage: [number]
  clearRefImages: []
  removeBlendImage: [number]
  clearBlendImages: []
  'update:mjParamIw': [number]
  'update:mjParamStylize': [number]
  'update:mjParamChaos': [number]
  'update:mjParamWeird': [number]
  'update:mjParamStop': [number]
  'update:mjParamQuality': [number]
  'update:mjStyleRaw': [boolean]
  'update:mjRefCrefUrl': [string]
  'update:mjParamCw': [number]
  'update:mjRefSrefUrl': [string]
  'update:mjParamSw': [number]
  'update:mjParamSv': [number]
  'update:mjRefOrefUrl': [string]
  'update:mjParamOw': [number]
  'update:mjParamTile': [boolean]
  'update:mjParamDraft': [boolean]
  'update:mjV8OutputMode': ['off' | 'sd' | 'hd']
  'update:mjParamRepeat': [number]
  mjRefUploading: [boolean]
}>()

const dimOpt = (custom: boolean, tab: StudioTab) =>
  custom && (tab === 't2i' || tab === 'i2i' || tab === 'edits')
    ? 'opacity-45 pointer-events-none'
    : ''

const realisticVersions: { id: MjRealisticVersion; labelKey: string }[] = [
  { id: '8', labelKey: 'drawing.mjVersionV8' },
  { id: '7', labelKey: 'drawing.mjVersionV7' },
  { id: '6', labelKey: 'drawing.mjVersionV6' },
]

const nijiVersions: { id: MjNijiVersion; labelKey: string }[] = [
  { id: '7', labelKey: 'drawing.mjNijiVersionV7' },
  { id: '6', labelKey: 'drawing.mjNijiVersionV6' },
]

const speeds: { id: MjSpeedMode; labelKey: string }[] = [
  { id: 'fast', labelKey: 'drawing.mjModeFast' },
  { id: 'turbo', labelKey: 'drawing.mjModeTurbo' },
  { id: 'relax', labelKey: 'drawing.mjModeRelax' },
]

const aspects: { key: string; label?: string; labelKey?: string }[] = [
  { key: '1:1', label: '1:1' },
  { key: '3:2', label: '3:2' },
  { key: '3:4', label: '3:4' },
  { key: '4:3', label: '4:3' },
  { key: '9:16', label: '9:16' },
  { key: '16:9', label: '16:9' },
  { key: 'custom', labelKey: 'drawing.studioAspectCustom' },
]

/** 分段按钮：未选中 / 选中 */
function segBtn(active: boolean) {
  return [
    'min-h-[2.25rem] flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold leading-tight transition-all duration-150 sm:text-xs',
    active
      ? 'bg-gradient-to-b from-sky-500 to-sky-600 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.4),0_4px_14px_rgba(14,165,233,0.22)]'
      : 'border border-slate-600/70 bg-slate-900/50 text-slate-400 hover:border-slate-500 hover:bg-slate-800/60 hover:text-slate-200',
  ]
}

function onMjSpeedClick(id: MjSpeedMode) {
  if (props.mjOrefComboLock && (id === 'fast' || id === 'turbo')) return
  emit('update:mjMode', id)
}
</script>

<template>
  <aside
    class="drawing-studio-sidebar flex w-full shrink-0 flex-col border-b border-slate-700/50 bg-gradient-to-b from-[#0a0f18] via-[#080c12] to-[#06090e]"
    :class="
      embedded
        ? 'gap-2 p-3 md:gap-2.5 md:p-4 md:h-auto md:w-full md:border-b-0 md:border-r-0'
        : 'gap-3 p-4 md:gap-3.5 md:p-5 md:h-full md:w-[min(100%,380px)] md:border-b-0 md:border-r md:border-slate-700/40'
    "
  >
    <!-- 模型 + 工作流 -->
    <section
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3.5"
    >
      <div class="mb-1 flex items-center justify-between gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{
          t('drawing.studioSectionModel')
        }}</span>
      </div>
      <label class="sr-only">{{ t('drawing.selectModel') }}</label>
      <div class="relative mt-2">
        <select
          class="h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-600/50 bg-slate-950/60 pl-3.5 pr-10 text-sm font-medium text-slate-100 shadow-inner transition-colors hover:border-slate-500/70 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          :value="selectedModelKey"
          :disabled="modelsLoading || drawingModels.length === 0"
          @change="emit('update:selectedModelKey', ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="drawingModels.length === 0" value="" disabled>
            {{ modelsLoading ? '…' : t('drawing.noModels') }}
          </option>
          <option v-for="opt in drawingModels" :key="opt.model" :value="opt.model">
            {{ opt.modelName }}
          </option>
        </select>
        <span
          class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </div>

      <p class="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {{ t('drawing.studioSectionMode') }}
      </p>
      <div
        class="flex flex-wrap gap-1 rounded-xl border border-slate-700/40 bg-slate-950/40 p-1 shadow-inner"
      >
        <button
          v-for="tab in [
            { id: 't2i' as const, labelKey: 'drawing.studioTabT2I' },
            { id: 'i2i' as const, labelKey: 'drawing.studioTabI2I' },
            { id: 'spell' as const, labelKey: 'drawing.studioTabSpell' },
            { id: 'blend' as const, labelKey: 'drawing.studioTabBlend' },
            { id: 'edits' as const, labelKey: 'drawing.studioTabEdits' },
          ]"
          :key="tab.id"
          type="button"
          :class="segBtn(studioTab === tab.id)"
          class="min-w-[4.5rem]"
          @click="emit('update:studioTab', tab.id)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>

      <div v-if="studioTab === 'spell'" class="mt-2 flex gap-1.5">
        <button
          type="button"
          :class="segBtn(spellMode === 'describe')"
          class="!flex-1"
          @click="emit('update:spellMode', 'describe')"
        >
          Describe
        </button>
        <button
          type="button"
          :class="segBtn(spellMode === 'shorten')"
          class="!flex-1"
          @click="emit('update:spellMode', 'shorten')"
        >
          Shorten
        </button>
      </div>

      <details
        class="group mt-3 rounded-xl border border-slate-700/40 bg-slate-950/30 open:border-slate-600/45"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left [&::-webkit-details-marker]:hidden"
        >
          <span
            class="text-[11px] font-semibold text-sky-400/95 transition group-open:text-sky-300"
          >
            {{ t('drawing.studioModeHelpFold') }}
          </span>
          <svg
            class="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </summary>
        <div
          class="border-t border-slate-700/35 px-3 pb-3 pt-2 text-[11px] leading-relaxed text-slate-400"
        >
          <p class="whitespace-pre-line">{{ studioModeHelpBody }}</p>
        </div>
      </details>

      <details
        v-if="embedded && studioTab === 'spell'"
        class="group mt-2 rounded-xl border border-violet-700/35 bg-violet-950/20 open:border-violet-600/45"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left [&::-webkit-details-marker]:hidden"
        >
          <span class="text-[11px] font-semibold text-violet-300/95">{{
            t('drawing.mjSpellApiHelpFold')
          }}</span>
          <svg
            class="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </summary>
        <div
          class="border-t border-slate-700/35 px-3 pb-3 pt-2 text-[11px] leading-relaxed text-slate-400"
        >
          <p v-if="spellMode === 'describe'" class="whitespace-pre-line">
            {{ t('drawing.mjSpellApiHelpBodyDescribe') }}
          </p>
          <p v-else class="whitespace-pre-line">{{ t('drawing.mjSpellApiHelpBodyShorten') }}</p>
        </div>
      </details>
    </section>

    <!-- 风格 · 版本 · Seed（非嵌入页保持平铺；嵌入绘画页收入「更多选项」折叠，默认收起省高度） -->
    <section
      v-if="!embedded && (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')"
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3.5"
      :class="dimOpt(customParamsOnly, studioTab)"
    >
      <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{
        t('drawing.studioSectionStyle')
      }}</span>

      <p class="mb-2 mt-3 text-[11px] text-slate-500">{{ t('drawing.mjStyleTitle') }}</p>
      <div class="flex gap-1.5">
        <button
          type="button"
          :class="segBtn(mjStyle === 'realistic')"
          class="!flex-1"
          @click="emit('update:mjStyle', 'realistic')"
        >
          {{ t('drawing.mjStyleRealistic') }}
        </button>
        <button
          type="button"
          :class="segBtn(mjStyle === 'anime')"
          class="!flex-1"
          @click="emit('update:mjStyle', 'anime')"
        >
          {{ t('drawing.mjStyleAnime') }}
        </button>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex items-center gap-1.5">
          <span class="text-[11px] font-medium text-slate-400">{{
            t('drawing.mjVersionLabel')
          }}</span>
          <button
            type="button"
            class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-600 transition hover:bg-slate-800 hover:text-slate-400"
            :title="t('drawing.mjVersionHint')"
            :aria-label="t('drawing.mjVersionHint')"
          >
            ⓘ
          </button>
        </div>
        <div v-if="mjStyle === 'realistic'" class="flex gap-1">
          <button
            v-for="rv in realisticVersions"
            :key="rv.id"
            type="button"
            :class="segBtn(mjRealisticVersion === rv.id)"
            @click="emit('update:mjRealisticVersion', rv.id)"
          >
            {{ t(rv.labelKey) }}
          </button>
        </div>
        <div v-else class="flex gap-1">
          <button
            v-for="nv in nijiVersions"
            :key="nv.id"
            type="button"
            :class="segBtn(mjNijiVersion === nv.id)"
            class="!flex-1"
            @click="emit('update:mjNijiVersion', nv.id)"
          >
            {{ t(nv.labelKey) }}
          </button>
        </div>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex items-center gap-1.5">
          <span class="text-[11px] font-medium text-slate-400">{{ t('drawing.mjSeedLabel') }}</span>
          <button
            type="button"
            class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-600 transition hover:bg-slate-800 hover:text-slate-400"
            :title="t('drawing.mjSeedHint')"
            :aria-label="t('drawing.mjSeedHint')"
          >
            ⓘ
          </button>
        </div>
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          class="h-10 w-full rounded-xl border border-slate-600/50 bg-slate-950/60 px-3.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
          :value="mjSeed"
          :placeholder="t('drawing.mjSeedPlaceholder')"
          autocomplete="off"
          @input="emit('update:mjSeed', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </section>

    <!-- 速度（绘画嵌入页紧跟工作流，便于先选通道再写描述） -->
    <section
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3.5"
      :class="embedded ? '!p-2.5 md:!p-3' : ''"
    >
      <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {{ t('drawing.studioSectionSpeed') }}
      </p>
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="s in speeds"
          :key="s.id"
          type="button"
          :disabled="mjOrefComboLock && (s.id === 'fast' || s.id === 'turbo')"
          :class="[
            ...segBtn(mjMode === s.id),
            mjOrefComboLock && (s.id === 'fast' || s.id === 'turbo')
              ? 'cursor-not-allowed opacity-40'
              : '',
          ]"
          @click="onMjSpeedClick(s.id)"
        >
          {{ t(s.labelKey) }}
        </button>
      </div>
      <p v-if="mjOrefComboLock" class="mt-1.5 text-[10px] leading-snug text-amber-200/90">
        {{ t('drawing.mjOrefSpeedRelaxHint') }}
      </p>
    </section>

    <!-- 比例（独立绘画页平铺；嵌入页收入下方「更多选项」） -->
    <section
      v-if="!embedded && (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')"
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3.5"
      :class="dimOpt(customParamsOnly, studioTab)"
    >
      <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {{ t('drawing.studioAspectTitle') }}
      </p>
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="a in aspects"
          :key="a.key"
          type="button"
          :class="segBtn(aspectKey === a.key)"
          @click="emit('update:aspectKey', a.key)"
        >
          {{ a.labelKey ? t(a.labelKey) : a.label }}
        </button>
      </div>
      <div v-if="aspectKey === 'custom'" class="mt-2.5 space-y-1.5">
        <input
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="w-full rounded-xl border border-slate-600/50 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          :class="aspectCustomInvalid ? 'border-amber-500/40 ring-1 ring-amber-500/15' : ''"
          :value="aspectCustomRatio"
          :placeholder="t('drawing.studioAspectCustomPlaceholder')"
          @input="emit('update:aspectCustomRatio', ($event.target as HTMLInputElement).value)"
        />
        <p v-if="aspectCustomInvalid" class="text-[11px] leading-snug text-amber-200/90">
          {{ t('drawing.studioAspectCustomInvalid') }}
        </p>
      </div>
    </section>

    <!-- 画面描述与参考图（置于自定义参数之上，先写需求再决定是否手写参数） -->
    <section
      v-if="studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits'"
      class="rounded-2xl border border-sky-500/15 bg-gradient-to-b from-slate-900/40 to-slate-950/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-3.5"
    >
      <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-500/80">
        {{ t('drawing.studioSectionPrompt') }}
      </p>
      <label class="mb-2 block text-[11px] font-medium text-slate-400">{{
        studioTab === 'edits' ? t('drawing.mjEditsPromptLabel') : t('drawing.imageDescription')
      }}</label>
      <textarea
        class="w-full resize-none rounded-xl border border-slate-600/50 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        :class="embedded ? 'min-h-[5.25rem]' : 'min-h-[120px]'"
        :value="promptText"
        :placeholder="
          studioTab === 'edits'
            ? t('drawing.mjEditsPromptPlaceholder')
            : t('drawing.promptPlaceholder')
        "
        :rows="embedded ? 3 : 4"
        @input="emit('update:promptText', ($event.target as HTMLTextAreaElement).value)"
      />
      <div v-if="studioTab === 't2i' || studioTab === 'i2i'" class="mt-3">
        <label
          class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >{{ t('drawing.mjRefImages') }}</label
        >
        <label
          class="relative flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-600/50 bg-slate-950/50 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-sky-500/40"
        >
          <input
            type="file"
            :accept="mjImageAccept"
            multiple
            class="absolute inset-0 z-[1] h-full w-full cursor-pointer opacity-0"
            @change="emit('imagineFiles', $event)"
          />
          <span class="pointer-events-none min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
            {{ t('drawing.mjTapToPickImages') }}
          </span>
          <span
            class="pointer-events-none shrink-0 rounded-lg bg-sky-600/90 px-2.5 py-1 text-[10px] font-semibold text-white"
          >
            {{ t('drawing.mjBrowseFiles') }}
          </span>
        </label>
        <DrawingUploadPreviewGrid
          :urls="refImagePreviews"
          accent="sky"
          @remove="emit('removeRefImage', $event)"
          @clear="emit('clearRefImages')"
        />
        <p v-if="refImagePreviews.length > 0" class="mt-1.5 text-[11px] text-slate-500">
          {{ refImagePreviews.length }} {{ t('drawing.mjFilesSelected') }}
        </p>
      </div>
    </section>

    <!-- Blend：多图混合（无文生描述，仅速度与模型） -->
    <section
      v-if="studioTab === 'blend'"
      class="rounded-2xl border border-teal-500/20 bg-gradient-to-b from-slate-900/40 to-slate-950/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-3.5"
    >
      <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-500/85">
        {{ t('drawing.mjToolBlend') }}
      </p>
      <p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {{ t('drawing.mjBlendDims') }}
      </p>
      <div class="mb-3 grid grid-cols-3 gap-1.5">
        <button
          v-for="dim in [
            { id: 'PORTRAIT' as const, labelKey: 'drawing.blendDimsPortrait' },
            { id: 'SQUARE' as const, labelKey: 'drawing.blendDimsSquare' },
            { id: 'LANDSCAPE' as const, labelKey: 'drawing.blendDimsLandscape' },
          ]"
          :key="dim.id"
          type="button"
          :class="segBtn(blendDimensions === dim.id)"
          @click="emit('update:blendDimensions', dim.id)"
        >
          {{ t(dim.labelKey) }}
        </button>
      </div>
      <label
        class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
        >{{ t('drawing.mjBlendImages') }}</label
      >
      <label
        class="relative flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-600/50 bg-slate-950/50 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-teal-500/40"
      >
        <input
          type="file"
          :accept="mjImageAccept"
          multiple
          class="absolute inset-0 z-[1] h-full w-full cursor-pointer opacity-0"
          @change="emit('blendFiles', $event)"
        />
        <span class="pointer-events-none min-w-0 flex-1 text-[11px] leading-snug text-slate-400">
          {{ t('drawing.mjTapToPickImages') }}
        </span>
        <span
          class="pointer-events-none shrink-0 rounded-lg bg-teal-600/90 px-2.5 py-1 text-[10px] font-semibold text-white"
        >
          {{ t('drawing.mjBrowseFiles') }}
        </span>
      </label>
      <DrawingUploadPreviewGrid
        :urls="blendImagePreviews"
        accent="teal"
        @remove="emit('removeBlendImage', $event)"
        @clear="emit('clearBlendImages')"
      />
      <p v-if="blendImagePreviews.length > 0" class="mt-1.5 text-[11px] text-slate-500">
        {{ blendImagePreviews.length }} {{ t('drawing.mjFilesSelected') }}
      </p>
      <details
        v-if="embedded"
        class="group mt-3 rounded-xl border border-teal-700/30 bg-teal-950/15 open:border-teal-600/40"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 text-left text-[11px] font-medium text-teal-200/90 [&::-webkit-details-marker]:hidden"
        >
          <span>{{ t('drawing.mjBlendApiHelpFold') }}</span>
          <span
            class="text-[10px] text-slate-500 transition-transform group-open:rotate-180"
            aria-hidden="true"
            >▾</span
          >
        </summary>
        <p
          class="border-t border-teal-900/30 px-2 pb-2 pt-2 text-[10px] leading-relaxed text-slate-400 whitespace-pre-line"
        >
          {{ t('drawing.mjBlendApiHelpBody') }}
        </p>
      </details>
    </section>

    <!-- 嵌入绘画页：风格 / 比例 / 自定义参数 / 否定 / 小贴士（默认收起） -->
    <details
      v-if="embedded && (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')"
      class="group rounded-2xl border border-slate-700/45 bg-slate-900/20 open:border-slate-600/55"
    >
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold text-slate-300 transition hover:bg-slate-800/40 [&::-webkit-details-marker]:hidden"
      >
        <span>{{ t('drawing.mjSidebarMoreOptions') }}</span>
        <span
          class="inline-block shrink-0 text-[10px] text-slate-500 transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
          >▾</span
        >
      </summary>
      <div class="space-y-3 border-t border-slate-700/40 px-3 pb-3 pt-2">
        <section
          class="rounded-xl border border-slate-700/35 bg-slate-900/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3"
          :class="dimOpt(customParamsOnly, studioTab)"
        >
          <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{{
            t('drawing.studioSectionStyle')
          }}</span>

          <p class="mb-2 mt-2 text-[11px] text-slate-500">{{ t('drawing.mjStyleTitle') }}</p>
          <div class="flex gap-1.5">
            <button
              type="button"
              :class="segBtn(mjStyle === 'realistic')"
              class="!flex-1"
              @click="emit('update:mjStyle', 'realistic')"
            >
              {{ t('drawing.mjStyleRealistic') }}
            </button>
            <button
              type="button"
              :class="segBtn(mjStyle === 'anime')"
              class="!flex-1"
              @click="emit('update:mjStyle', 'anime')"
            >
              {{ t('drawing.mjStyleAnime') }}
            </button>
          </div>

          <div class="mt-3">
            <div class="mb-1.5 flex items-center gap-1.5">
              <span class="text-[11px] font-medium text-slate-400">{{
                t('drawing.mjVersionLabel')
              }}</span>
              <button
                type="button"
                class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-600 transition hover:bg-slate-800 hover:text-slate-400"
                :title="t('drawing.mjVersionHint')"
                :aria-label="t('drawing.mjVersionHint')"
              >
                ⓘ
              </button>
            </div>
            <div v-if="mjStyle === 'realistic'" class="flex gap-1">
              <button
                v-for="rv in realisticVersions"
                :key="rv.id"
                type="button"
                :class="segBtn(mjRealisticVersion === rv.id)"
                @click="emit('update:mjRealisticVersion', rv.id)"
              >
                {{ t(rv.labelKey) }}
              </button>
            </div>
            <div v-else class="flex gap-1">
              <button
                v-for="nv in nijiVersions"
                :key="nv.id"
                type="button"
                :class="segBtn(mjNijiVersion === nv.id)"
                class="!flex-1"
                @click="emit('update:mjNijiVersion', nv.id)"
              >
                {{ t(nv.labelKey) }}
              </button>
            </div>
          </div>

          <div class="mt-3">
            <div class="mb-1.5 flex items-center gap-1.5">
              <span class="text-[11px] font-medium text-slate-400">{{
                t('drawing.mjSeedLabel')
              }}</span>
              <button
                type="button"
                class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-600 transition hover:bg-slate-800 hover:text-slate-400"
                :title="t('drawing.mjSeedHint')"
                :aria-label="t('drawing.mjSeedHint')"
              >
                ⓘ
              </button>
            </div>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              class="h-9 w-full rounded-xl border border-slate-600/50 bg-slate-950/60 px-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              :value="mjSeed"
              :placeholder="t('drawing.mjSeedPlaceholder')"
              autocomplete="off"
              @input="emit('update:mjSeed', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </section>

        <section
          v-if="studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits'"
          class="rounded-xl border border-slate-700/35 bg-slate-900/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3"
          :class="dimOpt(customParamsOnly, studioTab)"
        >
          <p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {{ t('drawing.studioAspectTitle') }}
          </p>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="a in aspects"
              :key="a.key"
              type="button"
              :class="segBtn(aspectKey === a.key)"
              @click="emit('update:aspectKey', a.key)"
            >
              {{ a.labelKey ? t(a.labelKey) : a.label }}
            </button>
          </div>
          <div v-if="aspectKey === 'custom'" class="mt-2 space-y-1.5">
            <input
              type="text"
              inputmode="numeric"
              autocomplete="off"
              class="w-full rounded-xl border border-slate-600/50 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              :class="aspectCustomInvalid ? 'border-amber-500/40 ring-1 ring-amber-500/15' : ''"
              :value="aspectCustomRatio"
              :placeholder="t('drawing.studioAspectCustomPlaceholder')"
              @input="emit('update:aspectCustomRatio', ($event.target as HTMLInputElement).value)"
            />
            <p v-if="aspectCustomInvalid" class="text-[11px] leading-snug text-amber-200/90">
              {{ t('drawing.studioAspectCustomInvalid') }}
            </p>
          </div>
        </section>

        <MjCustomParamsSwitch
          v-if="studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits'"
          :enabled="customParamsOnly"
          @update:enabled="emit('update:customParamsOnly', $event)"
        />

        <div
          v-if="
            customParamsOnly &&
            (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')
          "
          class="rounded-xl border border-amber-500/30 bg-amber-950/20 px-2.5 py-2 text-[11px] leading-relaxed text-amber-100/95"
        >
          {{ t('drawing.mjCustomParamsActiveBanner') }}
        </div>

        <section
          v-if="studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits'"
          class="rounded-xl border border-slate-700/35 bg-slate-900/25 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3"
          :class="dimOpt(customParamsOnly, studioTab)"
        >
          <label
            class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
            >{{ t('drawing.negativePrompt') }}</label
          >
          <textarea
            class="min-h-[3.25rem] w-full resize-none rounded-xl border border-slate-600/50 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            :value="negativePrompt"
            :placeholder="t('drawing.negativePlaceholder')"
            rows="2"
            @input="emit('update:negativePrompt', ($event.target as HTMLTextAreaElement).value)"
          />
        </section>

        <MjImagineAdvParams
          v-if="studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits'"
          :show-iw="studioTab === 'i2i' || (studioTab === 't2i' && refImagePreviews.length > 0)"
          :mj-style="mjStyle"
          :mj-realistic-version="mjRealisticVersion"
          :mj-niji-version="mjNijiVersion"
          :iw="mjParamIw"
          :stylize="mjParamStylize"
          :chaos="mjParamChaos"
          :weird="mjParamWeird"
          :stop="mjParamStop"
          :quality="mjParamQuality"
          :style-raw="mjStyleRaw"
          :cref-url="mjRefCrefUrl"
          :cw="mjParamCw"
          :sref-url="mjRefSrefUrl"
          :sw="mjParamSw"
          :sv="mjParamSv"
          :oref-url="mjRefOrefUrl"
          :ow="mjParamOw"
          :tile="mjParamTile"
          :draft="mjParamDraft"
          :v8-output-mode="mjV8OutputMode"
          :repeat="mjParamRepeat"
          :mj-ref-upload-model-key="selectedModelKey"
          :mj-ref-upload-speed="mjMode"
          :oref-official-combo-lock="mjOrefComboLock"
          @update:iw="emit('update:mjParamIw', $event)"
          @update:stylize="emit('update:mjParamStylize', $event)"
          @update:chaos="emit('update:mjParamChaos', $event)"
          @update:weird="emit('update:mjParamWeird', $event)"
          @update:stop="emit('update:mjParamStop', $event)"
          @update:quality="emit('update:mjParamQuality', $event)"
          @update:style-raw="emit('update:mjStyleRaw', $event)"
          @update:cref-url="emit('update:mjRefCrefUrl', $event)"
          @update:cw="emit('update:mjParamCw', $event)"
          @update:sref-url="emit('update:mjRefSrefUrl', $event)"
          @update:sw="emit('update:mjParamSw', $event)"
          @update:sv="emit('update:mjParamSv', $event)"
          @update:oref-url="emit('update:mjRefOrefUrl', $event)"
          @update:ow="emit('update:mjParamOw', $event)"
          @update:tile="emit('update:mjParamTile', $event)"
          @update:draft="emit('update:mjParamDraft', $event)"
          @update:v8-output-mode="emit('update:mjV8OutputMode', $event)"
          @update:repeat="emit('update:mjParamRepeat', $event)"
          @mj-ref-uploading="emit('mjRefUploading', $event)"
        />

        <p class="px-0.5 text-[10px] leading-relaxed text-slate-600">
          {{ t('drawing.studioTips') }}
        </p>
      </div>
    </details>

    <div
      v-if="
        !embedded &&
        customParamsOnly &&
        (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')
      "
      class="rounded-2xl border border-amber-500/30 bg-amber-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/95"
    >
      {{ t('drawing.mjCustomParamsActiveBanner') }}
    </div>

    <MjCustomParamsSwitch
      v-if="!embedded && (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')"
      :enabled="customParamsOnly"
      @update:enabled="emit('update:customParamsOnly', $event)"
    />

    <!-- 否定提示 -->
    <section
      v-if="!embedded && (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')"
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3.5"
      :class="dimOpt(customParamsOnly, studioTab)"
    >
      <label
        class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
        >{{ t('drawing.negativePrompt') }}</label
      >
      <textarea
        class="min-h-[4.5rem] w-full resize-none rounded-xl border border-slate-600/50 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        :value="negativePrompt"
        :placeholder="t('drawing.negativePlaceholder')"
        rows="3"
        @input="emit('update:negativePrompt', ($event.target as HTMLTextAreaElement).value)"
      />
    </section>

    <MjImagineAdvParams
      v-if="!embedded && (studioTab === 't2i' || studioTab === 'i2i' || studioTab === 'edits')"
      :show-iw="studioTab === 'i2i' || (studioTab === 't2i' && refImagePreviews.length > 0)"
      :mj-style="mjStyle"
      :mj-realistic-version="mjRealisticVersion"
      :mj-niji-version="mjNijiVersion"
      :iw="mjParamIw"
      :stylize="mjParamStylize"
      :chaos="mjParamChaos"
      :weird="mjParamWeird"
      :stop="mjParamStop"
      :quality="mjParamQuality"
      :style-raw="mjStyleRaw"
      :cref-url="mjRefCrefUrl"
      :cw="mjParamCw"
      :sref-url="mjRefSrefUrl"
      :sw="mjParamSw"
      :sv="mjParamSv"
      :oref-url="mjRefOrefUrl"
      :ow="mjParamOw"
      :tile="mjParamTile"
      :draft="mjParamDraft"
      :v8-output-mode="mjV8OutputMode"
      :repeat="mjParamRepeat"
      :mj-ref-upload-model-key="selectedModelKey"
      :mj-ref-upload-speed="mjMode"
      :oref-official-combo-lock="mjOrefComboLock"
      @update:iw="emit('update:mjParamIw', $event)"
      @update:stylize="emit('update:mjParamStylize', $event)"
      @update:chaos="emit('update:mjParamChaos', $event)"
      @update:weird="emit('update:mjParamWeird', $event)"
      @update:stop="emit('update:mjParamStop', $event)"
      @update:quality="emit('update:mjParamQuality', $event)"
      @update:style-raw="emit('update:mjStyleRaw', $event)"
      @update:cref-url="emit('update:mjRefCrefUrl', $event)"
      @update:cw="emit('update:mjParamCw', $event)"
      @update:sref-url="emit('update:mjRefSrefUrl', $event)"
      @update:sw="emit('update:mjParamSw', $event)"
      @update:sv="emit('update:mjParamSv', $event)"
      @update:oref-url="emit('update:mjRefOrefUrl', $event)"
      @update:ow="emit('update:mjParamOw', $event)"
      @update:tile="emit('update:mjParamTile', $event)"
      @update:draft="emit('update:mjParamDraft', $event)"
      @update:v8-output-mode="emit('update:mjV8OutputMode', $event)"
      @update:repeat="emit('update:mjParamRepeat', $event)"
      @mj-ref-uploading="emit('mjRefUploading', $event)"
    />

    <p v-if="!embedded" class="px-0.5 text-[10px] leading-relaxed text-slate-600">
      {{ t('drawing.studioTips') }}
    </p>
    <details
      v-else-if="embedded && studioTab !== 't2i' && studioTab !== 'i2i' && studioTab !== 'edits'"
      class="group rounded-xl border border-slate-700/40 bg-slate-900/15 px-0.5 open:border-slate-600/45"
    >
      <summary
        class="cursor-pointer list-none rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-800/30 hover:text-slate-400 [&::-webkit-details-marker]:hidden"
      >
        <span class="inline-flex w-full items-center justify-between gap-2">
          {{ t('drawing.mjStudioTipFold') }}
          <span
            class="text-[9px] text-slate-600 transition-transform group-open:rotate-180"
            aria-hidden="true"
            >▾</span
          >
        </span>
      </summary>
      <p
        class="border-t border-slate-700/30 px-2 pb-2 pt-2 text-[10px] leading-relaxed text-slate-600"
      >
        {{ t('drawing.studioTips') }}
      </p>
    </details>
  </aside>
</template>
