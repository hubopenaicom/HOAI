/**
 * Midjourney 任务后续操作按钮：按官方能力分组并映射说明文案（匹配上游 label / emoji，容错脏字符串）。
 * @see https://docs.midjourney.com — Upscalers, Vary Region, Zoom Out, Pan 等
 */

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
  if (/animate\s*\(\s*high|high\s*motion|高动态|高幅度|high\s*anim/i.test(s)) {
    return { group: 'animate', hintKey: 'drawing.mjHintAnimateHigh' }
  }
  if (/animate\s*\(\s*low|low\s*motion|低动态|低幅度|low\s*anim/i.test(s)) {
    return { group: 'animate', hintKey: 'drawing.mjHintAnimateLow' }
  }
  if (/animate|animation|motion|动态影像|短片|luma|runway|视频化/i.test(s)) {
    return { group: 'animate', hintKey: 'drawing.mjHintAnimateGeneric' }
  }

  // 实用工具
  if (/remove\s*background|rembg|去背|抠图|移除背景|删除背景/i.test(s)) {
    return { group: 'utility', hintKey: 'drawing.mjHintRemoveBg' }
  }

  return { group: 'other', hintKey: null }
}

export function mjMiscButtonHintKey(btn: MjFollowBtn): string | null {
  return analyzeMjMiscButton(btn).hintKey
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
