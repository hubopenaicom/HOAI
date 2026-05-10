<script setup lang="ts">
import { t } from '@/locales'
import type { MjSpeedMode } from '@/api/drawingMj'

export type StudioTab = 't2i' | 'i2i' | 'spell'
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

withDefaults(
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
    /** 已选参考图张数（展示用） */
    refImageCount: number
    /** 与「AI 绘画」输入区叠在同一左栏时为 true，不占单独 md 宽度、不出现右侧竖线 */
    embedded?: boolean
  }>(),
  { embedded: false }
)

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
  imagineFiles: [Event]
}>()

const dimOpt = (custom: boolean, tab: StudioTab) =>
  custom && (tab === 't2i' || tab === 'i2i') ? 'opacity-45 pointer-events-none' : ''

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
</script>

<template>
  <aside
    class="drawing-studio-sidebar flex w-full shrink-0 flex-col gap-3 border-b border-slate-700/50 bg-gradient-to-b from-[#0a0f18] via-[#080c12] to-[#06090e] p-4 md:gap-3.5 md:p-5"
    :class="
      embedded
        ? 'md:h-auto md:w-full md:border-b-0 md:border-r-0'
        : 'md:h-full md:w-[min(100%,380px)] md:border-b-0 md:border-r md:border-slate-700/40'
    "
  >
    <!-- 模型 + 工作流 -->
    <section
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm md:p-3.5"
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
        class="flex gap-1 rounded-xl border border-slate-700/40 bg-slate-950/40 p-1 shadow-inner"
      >
        <button
          v-for="tab in [
            { id: 't2i' as const, labelKey: 'drawing.studioTabT2I' },
            { id: 'i2i' as const, labelKey: 'drawing.studioTabI2I' },
            { id: 'spell' as const, labelKey: 'drawing.studioTabSpell' },
          ]"
          :key="tab.id"
          type="button"
          :class="segBtn(studioTab === tab.id)"
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
    </section>

    <!-- 风格 · 版本 · Seed -->
    <section
      v-if="studioTab === 't2i' || studioTab === 'i2i'"
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm md:p-3.5"
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

    <!-- 速度 -->
    <section
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm md:p-3.5"
    >
      <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {{ t('drawing.studioSectionSpeed') }}
      </p>
      <div class="grid grid-cols-3 gap-1.5">
        <button
          v-for="s in speeds"
          :key="s.id"
          type="button"
          :class="segBtn(mjMode === s.id)"
          @click="emit('update:mjMode', s.id)"
        >
          {{ t(s.labelKey) }}
        </button>
      </div>
    </section>

    <!-- 比例 -->
    <section
      v-if="studioTab === 't2i'"
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm md:p-3.5"
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
      v-if="studioTab === 't2i' || studioTab === 'i2i'"
      class="rounded-2xl border border-sky-500/15 bg-gradient-to-b from-slate-900/40 to-slate-950/30 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-3.5"
    >
      <p class="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-500/80">
        {{ t('drawing.studioSectionPrompt') }}
      </p>
      <label class="mb-2 block text-[11px] font-medium text-slate-400">{{
        t('drawing.imageDescription')
      }}</label>
      <textarea
        class="min-h-[120px] w-full resize-none rounded-xl border border-slate-600/50 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        :value="promptText"
        :placeholder="t('drawing.promptPlaceholder')"
        rows="4"
        @input="emit('update:promptText', ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="mt-3">
        <label
          class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >{{ t('drawing.mjRefImages') }}</label
        >
        <input
          type="file"
          accept="image/*"
          multiple
          class="file-input file-input-sm h-10 w-full rounded-xl border border-slate-600/50 bg-slate-950/50 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600/90 file:px-3 file:text-xs file:font-medium file:text-white hover:file:bg-sky-500"
          @change="emit('imagineFiles', $event)"
        />
        <p v-if="refImageCount > 0" class="mt-2 text-[11px] text-slate-500">
          {{ refImageCount }} {{ t('drawing.mjFilesSelected') }}
        </p>
      </div>
    </section>

    <div
      v-if="customParamsOnly && (studioTab === 't2i' || studioTab === 'i2i')"
      class="rounded-2xl border border-amber-500/30 bg-amber-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/95"
    >
      {{ t('drawing.mjCustomParamsActiveBanner') }}
    </div>

    <!-- 自定义参数 -->
    <section
      v-if="studioTab === 't2i' || studioTab === 'i2i'"
      class="rounded-2xl border border-violet-500/20 bg-violet-950/15 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-3.5"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-200">{{
              t('drawing.mjCustomParamsTitle')
            }}</span>
            <button
              type="button"
              class="text-[10px] text-slate-500 hover:text-slate-400"
              :title="t('drawing.mjCustomParamsHint')"
            >
              ⓘ
            </button>
          </div>
          <p class="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">
            {{ t('drawing.mjCustomParamsHint') }}
          </p>
        </div>
        <input
          type="checkbox"
          class="toggle toggle-primary toggle-sm shrink-0 border-slate-600"
          role="switch"
          :aria-checked="customParamsOnly"
          :checked="customParamsOnly"
          @change="emit('update:customParamsOnly', ($event.target as HTMLInputElement).checked)"
        />
      </div>
    </section>

    <!-- 否定提示 -->
    <section
      v-if="studioTab === 't2i'"
      class="rounded-2xl border border-slate-700/35 bg-slate-900/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm md:p-3.5"
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

    <p class="px-0.5 text-[10px] leading-relaxed text-slate-600">{{ t('drawing.studioTips') }}</p>
  </aside>
</template>
