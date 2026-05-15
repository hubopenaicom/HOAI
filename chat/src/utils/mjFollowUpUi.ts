/**
 * Midjourney 任务后续操作按钮：按官方能力分组并映射说明文案（匹配上游 label / emoji，容错脏字符串）。
 * @see https://docs.midjourney.com — Upscalers, Vary Region, Zoom Out, Pan 等
 */

import {
  mjTaskPromptFirstLine,
  mjCollapseNestedFollowUpLabelForDisplay,
  mjFollowUpSourceTextForNextWrap,
} from '@/utils/mjApiParse'

export type MjFollowBtn = { customId: string; label: string; emoji?: string }

/** 放大后「其它」里的逻辑分组（展示顺序） */
export type MjMiscGroup =
  | 'refineUpscale'
  | 'varyEdit'
  | 'zoomOut'
  | 'pan'
  | 'animate'
  | 'utility'
  | 'other'

export const MJ_MISC_GROUP_ORDER: MjMiscGroup[] = [
  'refineUpscale',
  'varyEdit',
  'zoomOut',
  'pan',
  'animate',
  'utility',
  'other',
]

function norm(btn: MjFollowBtn): string {
  return `${btn.emoji || ''} ${btn.label || ''}`.trim().toLowerCase().replace(/\s+/g, ' ')
}

function rawFull(btn: MjFollowBtn): string {
  return `${btn.emoji || ''} ${btn.label || ''}`.trim()
}

/**
 * 美化上游原始 label（仅展示用，不影响 customId / 匹配逻辑）。
 * 常见脏串：upscale_1Upscale (Subtle)、vary_2Vary (Strong) 等。
 */
export function formatMjUpstreamButtonLabel(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/^upscale_\d+\s*Upscale\s*/i, 'Upscale ')
  s = s.replace(/^upscale_\d+Upscale\s*/i, 'Upscale ')
  s = s.replace(/^vary_\d+\s*Vary\s*/i, 'Vary ')
  s = s.replace(/^vary_\d+Vary\s*/i, 'Vary ')
  s = s.replace(/^zoom_\d+\s*Zoom\s*/i, 'Zoom ')
  s = s.replace(/^zoom_out_\d+\s*/i, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function mjMiscGroupTitleKey(g: MjMiscGroup): string {
  const m: Record<MjMiscGroup, string> = {
    refineUpscale: 'drawing.mjMiscGroupRefineUpscale',
    varyEdit: 'drawing.mjMiscGroupVaryEdit',
    zoomOut: 'drawing.mjMiscGroupZoomOut',
    pan: 'drawing.mjMiscGroupPan',
    animate: 'drawing.mjMiscGroupAnimate',
    utility: 'drawing.mjMiscGroupUtility',
    other: 'drawing.mjMiscGroupOther',
  }
  return m[g]
}

/** 分组下简短引导；无文案时组件侧不渲染 */
export function mjMiscGroupIntroKey(g: MjMiscGroup): string | null {
  const m: Record<MjMiscGroup, string | null> = {
    refineUpscale: 'drawing.mjMiscGroupIntroRefineUpscale',
    varyEdit: 'drawing.mjMiscGroupIntroVaryEdit',
    zoomOut: 'drawing.mjMiscGroupIntroZoomOut',
    pan: 'drawing.mjMiscGroupIntroPan',
    animate: 'drawing.mjMiscGroupIntroAnimate',
    utility: 'drawing.mjMiscGroupIntroUtility',
    other: 'drawing.mjMiscGroupIntroOther',
  }
  return m[g]
}

/**
 * 识别单枚 misc 按钮所属分组与 i18n 说明键（hint）。
 * 顺序：先匹配更具体的模式，避免误判。
 */
export function analyzeMjMiscButton(btn: MjFollowBtn): {
  group: MjMiscGroup
  hintKey: string | null
} {
  const raw = rawFull(btn)
  const s = norm(btn)
  if (!raw) return { group: 'other', hintKey: null }

  // 重新生成 / Reroll（不与 upscale/vary 等复合文案冲突）
  if (
    /🔄|↻|🔁|⟳|\u21bb|\u{1f504}/u.test(raw) ||
    (/\breroll\b|重新生成|重新绘制|再来一版/.test(s) &&
      !/upscale|vary\s*\(|zoom|pan|animate|background/i.test(s))
  ) {
    return { group: 'other', hintKey: 'drawing.mjHintReroll' }
  }

  // Vary Region / Inpaint
  if (
    /vary\s*\(\s*region|vary\s*region|inpaint|局部重绘|区域|蒙版|笔刷|🖌|🖍/.test(s) ||
    (/region/i.test(s) && /vary|局部/.test(raw))
  ) {
    return { group: 'varyEdit', hintKey: 'drawing.mjHintVaryRegion' }
  }

  if (/vary\s*\(\s*strong|强变体|强烈变体/.test(s)) {
    return { group: 'varyEdit', hintKey: 'drawing.mjHintVaryStrongFollowup' }
  }

  if (/vary\s*\(\s*subtle|微妙变体/.test(s)) {
    return { group: 'varyEdit', hintKey: 'drawing.mjHintVarySubtleFollowup' }
  }

  // 精细放大 Subtle / Creative（须含 upscale，避免与 Vary (Subtle) 混淆）
  if (
    (/upscale/i.test(s) || /精细放大|二次放大/.test(raw)) &&
    /\(subtle\)|subtle upscaler|upscale[^\w]*subtle|微妙|保守/.test(s)
  ) {
    return { group: 'refineUpscale', hintKey: 'drawing.mjHintUpscaleSubtle' }
  }

  if (
    (/upscale/i.test(s) || /精细放大|二次放大/.test(raw)) &&
    /\(creative\)|creative upscaler|upscale[^\w]*creative|创意/.test(s)
  ) {
    return { group: 'refineUpscale', hintKey: 'drawing.mjHintUpscaleCreative' }
  }

  // Zoom Out / Custom Zoom
  if (/custom zoom|自定义变焦|自定义缩放|定制变焦/i.test(s)) {
    return { group: 'zoomOut', hintKey: 'drawing.mjHintCustomZoom' }
  }

  if (/zoom out 1\.5|1\.5\s*x\s*zoom|zoom\s*1\.5|1\.5\s*倍|变焦[^，]*1\.5/i.test(s)) {
    return { group: 'zoomOut', hintKey: 'drawing.mjHintZoomOut15x' }
  }

  if (/zoom out 2|2\s*x\s*zoom|zoom\s*2|2\s*倍变焦|拉远\s*2|缩小\s*2/i.test(s)) {
    return { group: 'zoomOut', hintKey: 'drawing.mjHintZoomOut2x' }
  }

  if (/zoom out|zoom-out|拉远|变焦拉出|缩小视图/i.test(s)) {
    return { group: 'zoomOut', hintKey: 'drawing.mjHintZoomOutGeneric' }
  }

  // Pan：箭头或文案（Midjourney 文档：沿方向扩展画布）
  if (/⬅|←|◀|\u2190|west|pan\s*(left|←)|extend.*left|向左|左扩/i.test(raw)) {
    return { group: 'pan', hintKey: 'drawing.mjHintPanLeft' }
  }
  if (/➡|→|▶|\u2192|east|pan\s*(right|→)|extend.*right|向右|右扩/i.test(raw)) {
    return { group: 'pan', hintKey: 'drawing.mjHintPanRight' }
  }
  if (/⬆|↑|north|pan\s*up|extend.*up|向上|上扩/i.test(raw)) {
    return { group: 'pan', hintKey: 'drawing.mjHintPanUp' }
  }
  if (/⬇|↓|south|pan\s*down|extend.*down|向下|下扩/i.test(raw)) {
    return { group: 'pan', hintKey: 'drawing.mjHintPanDown' }
  }

  // Animate（合作方短片；文案随上游）
  if (
    /animate\s*\(\s*high|animate\s*\(\s*high\s*motion|animate\s*\(\s*high\)|高动态|高幅度|high\s*motion|high\s*anim/i.test(
      s
    )
  ) {
    return { group: 'animate', hintKey: 'drawing.mjHintAnimateHigh' }
  }
  if (
    /animate\s*\(\s*low|animate\s*\(\s*low\s*motion|animate\s*\(\s*low\)|低动态|低幅度|low\s*motion|low\s*anim/i.test(
      s
    )
  ) {
    return { group: 'animate', hintKey: 'drawing.mjHintAnimateLow' }
  }
  if (/animate|animation|motion|动态影像|短片|luma|runway|视频化/i.test(s)) {
    return { group: 'animate', hintKey: 'drawing.mjHintAnimateGeneric' }
  }

  // 实用工具
  if (
    /remove[\s_-]*background|removebackground|rem[\s_-]*bg|\brembg\b|去背|抠图|移除背景|删除背景/i.test(
      s
    )
  ) {
    return { group: 'utility', hintKey: 'drawing.mjHintRemoveBg' }
  }

  return { group: 'other', hintKey: null }
}

export function mjMiscButtonHintKey(btn: MjFollowBtn): string | null {
  return analyzeMjMiscButton(btn).hintKey
}

/**
 * 从 customId / 拼接串识别「动态短片」「去背景」等（上游常把类型写在 id 里、label 为空或与展示不一致）。
 */
export function mjMiscPolicyBlockFromProbeText(text: string): 'animate' | 'utility' | null {
  const low = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!low) return null
  if (
    /::\s*animate|\banimate::|mj::[^:\n]*animate|_animate_|animate[_\s-]*high|animate[_\s-]*low|high[_\s-]*motion|low[_\s-]*motion|highmotion|lowmotion|\bluma\b|\brunway\b|motion[_\s-]*clip|video[_\s-]*to[_\s-]*anim|short[_\s-]*clip|dynamic[_\s-]*video|🎬/.test(
      low
    ) ||
    (/\banimate\b/.test(low) && /high|low|motion|luma|runway|clip|video|短片|动态/.test(low))
  ) {
    return 'animate'
  }
  if (
    /remove[_\s-]*background|removebackground|\brembg\b|rem[_\s-]*bg|delete[_\s-]*background|background[_\s-]*removal|::rembg|::removebg|去背|抠图|移除背景|删除背景/.test(
      low
    )
  ) {
    return 'utility'
  }
  return null
}

/** 运营策略：动态短片 / 实用工具点击后仅提示，不提交上游 */
export function mjMiscButtonPolicyBlockReason(
  btn: MjFollowBtn | null | undefined
): 'animate' | 'utility' | null {
  if (!btn) return null
  const { group } = analyzeMjMiscButton(btn)
  if (group === 'animate' || group === 'utility') return group
  const probe = `${String(btn.customId || '')}\n${rawFull(btn)}`
  return mjMiscPolicyBlockFromProbeText(probe)
}

/** Vary (Region) / 局部重绘：需弹窗绘制蒙版后走 submit/modal，不可直接 submit/action */
export function mjButtonIsVaryRegion(btn: MjFollowBtn): boolean {
  const raw = `${btn.emoji || ''} ${btn.label || ''}`.trim()
  const s = raw.toLowerCase().replace(/\s+/g, ' ')
  if (/vary\s*\(\s*region|vary\s*region|inpaint|局部重绘|区域重绘|区域变体|蒙版/.test(s))
    return true
  if (/region/i.test(s) && /vary|局部|蒙版|笔刷|🖌/.test(raw)) return true
  return false
}

/**
 * Custom Zoom：与 OpenAPI `/mj/submit/action` + `/mj/submit/modal` 一致——先 action 打开 MODAL（code=21），再 modal 提交 prompt/--zoom 等。
 * 不可仅单次 submit/action（与 Zoom Out 1.5x 等一键动作不同）。
 */
export function mjButtonIsCustomZoom(btn: MjFollowBtn): boolean {
  const raw = `${btn.emoji || ''} ${btn.label || ''}`.trim()
  const s = raw.toLowerCase().replace(/\s+/g, ' ')
  if (/custom zoom|自定义变焦|自定义缩放|定制变焦/i.test(s)) return true
  const cid = String(btn.customId || '')
  if (/custom.?zoom|zoom.?custom|custom_zoom|CUSTOM_ZOOM/i.test(cid)) return true
  if (/::custom.?zoom::|::zoom.?custom::/i.test(cid)) return true
  return false
}

/** 将 misc 段按钮按组拆分，保持组内相对顺序 */
export function groupMjMiscButtons(
  items: MjFollowBtn[]
): Array<{ group: MjMiscGroup; items: MjFollowBtn[] }> {
  const buckets = new Map<MjMiscGroup, MjFollowBtn[]>()
  for (const g of MJ_MISC_GROUP_ORDER) buckets.set(g, [])
  for (const btn of items) {
    const { group } = analyzeMjMiscButton(btn)
    buckets.get(group)!.push(btn)
  }
  return MJ_MISC_GROUP_ORDER.filter(g => (buckets.get(g)?.length ?? 0) > 0).map(g => ({
    group: g,
    items: buckets.get(g)!,
  }))
}

/** 列表项上用于解析「父任务摘要」的最小结构 */
export type MjParentJobLike = {
  promptLabel?: string
  task?: Record<string, unknown>
}

/** 后续任务写入 `mjFollowUpLabeled` 的 `{source}` 单行上限；过小易在「」外截断导致壳解析失败、再次套娃。 */
const MJ_FOLLOW_UP_PARENT_SOURCE_MAX = 120

function clampOneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

function isGenericFollowUpLabel(s: string): boolean {
  const x = s.trim().toLowerCase()
  return x === '后续任务' || x === 'follow-up' || x === 'follow up'
}

function mjExtractPromptFirstLineFromTask(task: Record<string, unknown> | undefined): string {
  return mjTaskPromptFirstLine(task)
}

function mjFollowBtnIsRegenerate(btn: MjFollowBtn): boolean {
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

/**
 * 父任务在列表中的摘要一行（用于下一次 `mjFollowUpLabeled` 的 `{source}`，勿含外层「来自「」壳，否则会套娃）。
 * 若 promptLabel 仅为「后续任务」等泛称，则回退到任务对象里的首行提示。
 */
export function mjParentLineForFollowUp(job: MjParentJobLike | undefined): string {
  if (!job) return ''
  const pl = (job.promptLabel || '').trim()
  if (pl && !isGenericFollowUpLabel(pl)) {
    const core = mjCollapseNestedFollowUpLabelForDisplay(pl).trim() || pl
    if (core && !isGenericFollowUpLabel(core)) {
      return clampOneLine(mjFollowUpSourceTextForNextWrap(core), MJ_FOLLOW_UP_PARENT_SOURCE_MAX)
    }
  }
  const fromTask = mjExtractPromptFirstLineFromTask(job.task)
  if (fromTask)
    return clampOneLine(mjFollowUpSourceTextForNextWrap(fromTask), MJ_FOLLOW_UP_PARENT_SOURCE_MAX)
  return pl ? clampOneLine(mjFollowUpSourceTextForNextWrap(pl), MJ_FOLLOW_UP_PARENT_SOURCE_MAX) : ''
}

/**
 * 后续操作的人类可读摘要（与平铺按钮 / 下拉共用一套逻辑）。
 * @param quadrantText 已本地化文案（如「左上」），仅当 label 为 U1–V4 时使用
 */
export function mjFollowUpActionDisplay(
  btn: MjFollowBtn | null,
  customId: string,
  quadrantText?: string,
  opts?: { regenerateLabel?: string }
): string {
  const cid = String(customId || '').trim()
  const L = btn ? String(btn.label || '').trim() : ''
  if (btn && opts?.regenerateLabel && mjFollowBtnIsRegenerate(btn)) {
    return opts.regenerateLabel
  }
  if (/^[UV][1-4]$/i.test(L) && quadrantText) {
    return `${L} · ${quadrantText}`
  }
  if (btn) {
    const raw = `${btn.emoji ? `${btn.emoji} ` : ''}${L}`.trim()
    const pretty = formatMjUpstreamButtonLabel(btn.label)
    const primary = (pretty || raw).trim()
    if (primary) return clampOneLine(primary, 64)
  }
  if (cid.length > 72) return `${cid.slice(0, 69)}…`
  return cid || '—'
}

export type MjFollowUpPromptTranslate = (key: string, params?: Record<string, string>) => string

/**
 * 生成任务卡片上展示的「后续任务」标题：来源摘要 + 本次操作。
 */
export function buildMjFollowUpPromptLabel(
  parent: MjParentJobLike | undefined,
  opts: {
    btn?: MjFollowBtn | null
    customId?: string
    quadrantText?: string
    actionOverride?: string
    regenerateLabel?: string
  },
  translate: MjFollowUpPromptTranslate
): string {
  const src = mjParentLineForFollowUp(parent)
  const act =
    opts.actionOverride?.trim() ||
    mjFollowUpActionDisplay(opts.btn ?? null, opts.customId || '', opts.quadrantText, {
      regenerateLabel: opts.regenerateLabel,
    })
  const generic = translate('drawing.mjFollowUp')
  if (!src) return act && act !== '—' ? act : generic
  if (!act || act === '—') {
    return translate('drawing.mjFollowUpLabeled', { source: src, action: generic })
  }
  return translate('drawing.mjFollowUpLabeled', { source: src, action: act })
}

/**
 * submit/modal 提示词清洗（与后端 `sanitizeMjSubmitModalPromptLine` 对齐）：
 * 去掉行首 1️⃣ / 1、 / 1. / 1 等序号（可叠写），避免上游误解析。
 */
export function stripMjDescribeLeadImageUrl(s: string): string {
  const t = String(s ?? '').trim()
  const m = /^(https?:\/\/\S+)\s+(.+)$/i.exec(t)
  if (m && m[2].trim().length > 8) return m[2].trim()
  return t
}

const MJ_DESCRIBE_SEG_SPLIT =
  /(?:^|[\r\n]+|\s)(?:(?:[1-4](?:\uFE0F\u20E3|\uFE0F?\u20E3))|(?:[①②③④])|[1-4]\s*[.\u3002\uff0e\uff09\):：、])\s*/gu

export function hasMjDescribeMultiSpellMarkers(s: string): boolean {
  const raw = String(s ?? '')
  const re = new RegExp(MJ_DESCRIBE_SEG_SPLIT.source, 'gu')
  let n = 0
  while (re.exec(raw)) {
    n++
    if (n >= 2) return true
  }
  return false
}

export function splitMjDescribeInlineSegments(blob: string): string[] {
  const raw = String(blob ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim()
  if (!raw) return []
  const parts = raw.split(MJ_DESCRIBE_SEG_SPLIT)
  const out = parts
    .map(p => stripMjDescribeLeadImageUrl(p.replace(/\s+/g, ' ').trim()))
    .filter(p => p.length > 8)
  if (out.length) return out
  const one = stripMjDescribeLeadImageUrl(raw.replace(/\s+/g, ' ').trim())
  return one ? [one] : []
}

function normalizeMjDescribeSpellHint(h: string): string {
  return sanitizeMjSubmitModalPromptLine(h).toLowerCase().replace(/\s+/g, ' ').trim()
}

export function pickMjDescribeSpellSegment(blob: string, hint?: string): string {
  const segs = splitMjDescribeInlineSegments(blob)
  if (segs.length <= 1) {
    return segs[0] || stripMjDescribeLeadImageUrl(String(blob ?? '').trim())
  }
  const h = hint ? normalizeMjDescribeSpellHint(hint) : ''
  if (h) {
    let best = segs[0]
    let bestScore = -1
    for (const seg of segs) {
      const n = normalizeMjDescribeSpellHint(seg)
      if (!n) continue
      let score = 0
      if (n === h) score = 10000
      else if (n.startsWith(h) || h.startsWith(n)) score = 5000 + Math.min(n.length, h.length)
      else if (n.includes(h) || h.includes(n)) score = 3000 + Math.min(n.length, h.length)
      else {
        const words = h.split(/\s+/).filter(w => w.length > 3)
        score = words.filter(w => n.includes(w)).length * 50
      }
      if (score > bestScore) {
        bestScore = score
        best = seg
      }
    }
    if (bestScore > 0) return best
  }
  return segs[0]
}

export function sanitizeMjSubmitModalPromptLine(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim()
  if (!s) return s
  s = s.split(/\r?\n/)[0]?.trim() ?? s
  for (let i = 0; i < 16; i++) {
    const before = s
    s = s.replace(/^\s*[\u2460-\u2468]\s*/u, '')
    s = s.replace(/^\s*\d(?:\uFE0F\u20E3|\uFE0F?\u20E3)\s*/u, '')
    s = s.replace(/^\s*\d{1,2}[.\u3002\uff0e\uff09\):：、]\s*/u, '').trim()
    s = s.replace(/^\s*\d{1,2}[.\u3002\uff0e](?=\S)/u, '').trim()
    s = s.replace(/^\s*[1-4]\s+/, '').trim()
    if (s === before) break
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** submit/modal：Describe 多咒语录并取单条 → 剥序号 → 逗号 shield（与后端 `prepareMjSubmitModalPromptLine` 对齐） */
export function prepareMjSubmitModalPromptLine(
  raw: string,
  hint?: string,
  opts?: { keepMjFlags?: boolean },
): string {
  let blob = String(raw ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim()
  if (!blob) return blob
  blob = stripMjDescribeLeadImageUrl(blob)
  const picked =
    hasMjDescribeMultiSpellMarkers(blob) || splitMjDescribeInlineSegments(blob).length > 1
      ? pickMjDescribeSpellSegment(blob, hint)
      : blob.split(/\r?\n/)[0]?.trim() || blob
  const cleaned = sanitizeMjSubmitModalPromptLine(picked)
  let out = shieldMjModalAsciiCommasOutsideMjFlags(cleaned)
  if (!opts?.keepMjFlags && !/\s--zoom\s/i.test(out)) {
    out = stripMjModalPromptMjFlags(out)
  }
  return out
}

/** 去掉 prompt 中首个 MJ 参数段；Custom Zoom 须保留 `--zoom` 时不要调用 */
export function stripMjModalPromptMjFlags(line: string): string {
  const s = String(line ?? '').trim()
  if (!s) return s
  const m = /\s--(?=[a-zA-Z])/i.exec(s)
  if (!m) return s.replace(/\s+/g, ' ').trim()
  return s.slice(0, m.index).replace(/\s+/g, ' ').trim()
}

/**
 * Custom Zoom 提交 modal：与后端 `mj-outpaint-cz.stripMjModelVersionFlags` 一致。
 * 含 --zoom 的 prompt 若再带 --v/--niji 等，部分上游会在执行期报 invalid_parameter，故先剥离。
 */
export function stripMjModalPromptModelVersionFlags(line: string): string {
  return line
    .replace(/(^|\s)--v\s+\d+\b/gi, '$1')
    .replace(/(^|\s)--v\d+\b/gi, '$1')
    .replace(/(^|\s)--niji\s+\d+\b/gi, '$1')
    .replace(/(^|\s)--niji\d+\b/gi, '$1')
    .replace(/(^|\s)--draft\b/gi, '$1')
    .replace(/(^|\s)--hd\b/gi, '$1')
    .replace(/(^|\s)--sd\b/gi, '$1')
    .replace(/(^|\s)--raw\b/gi, '$1')
    .replace(/(^|\s)--style\s+raw\b/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * 与后端 `shieldMjModalAsciiCommasOutsideMjFlags` 一致：部分聚合按英文逗号拆段误把词当非法参数。
 */
export function shieldMjModalAsciiCommasOutsideMjFlags(line: string): string {
  const s = String(line ?? '')
  if (!s) return s
  const re = /\s--(?=[a-zA-Z])/i
  const m = re.exec(s)
  if (!m) return s.replace(/,/g, '\uFF0C')
  const head = s.slice(0, m.index).replace(/,/g, '\uFF0C')
  return head + s.slice(m.index)
}
