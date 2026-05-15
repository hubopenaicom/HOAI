import type { MjFollowBtn } from '@/utils/mjFollowUpUi'
import {
  formatMjUpstreamButtonLabel,
  sanitizeMjSubmitModalPromptLine,
  splitMjDescribeInlineSegments,
  stripMjDescribeLeadImageUrl,
} from '@/utils/mjFollowUpUi'

/** 与绘画页 `mjButtons` 一致：合并 task / properties.buttons 并去重 */
export function collectMjTaskButtonsFlat(task: Record<string, unknown> | undefined): MjFollowBtn[] {
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

function btnIsRegenerate(btn: MjFollowBtn): boolean {
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

export function mjDescribeActionRaw(task: Record<string, unknown> | undefined): string {
  if (!task) return ''
  const pr = task.properties as Record<string, unknown> | undefined
  return String(task.action ?? pr?.action ?? '').trim()
}

/** 是否为 Describe 图生文完成态（用于弹窗与咒语拆分） */
export function isMjDescribeResultJob(
  task: Record<string, unknown> | undefined,
  opts?: { promptLabel?: string }
): boolean {
  if (!task) return false
  if ((opts?.promptLabel || '').trim() === 'Describe') return true
  const a = mjDescribeActionRaw(task).toUpperCase()
  return a === 'DESCRIBE'
}

function pickDescribePromptBlob(task: Record<string, unknown>): string {
  const pr = task.properties as Record<string, unknown> | undefined
  const keys = [
    'promptEn',
    'prompt',
    'zhPrompt',
    'zh_prompt',
    'fullPrompt',
    'submitPrompt',
    'description',
  ] as const
  for (const k of keys) {
    const v = task[k]
    if (typeof v === 'string' && v.trim().length > 12) return v.trim()
    if (pr && typeof pr[k] === 'string' && String(pr[k]).trim().length > 12)
      return String(pr[k]).trim()
  }
  return ''
}

/** 从上游长文本中尽量拆出 4 条咒语（换行 / 编号 / 同行内嵌 1️⃣–4️⃣ / 少量分隔符） */
export function splitMjDescribePromptLines(blob: string): string[] {
  const raw = (blob || '').trim()
  if (!raw) return []

  const inline = splitMjDescribeInlineSegments(raw)
  if (inline.length >= 2) {
    return inline.slice(0, 4).map(s => sanitizeMjSubmitModalPromptLine(s))
  }

  const lines = raw
    .split(/\r?\n/)
    .map(s => sanitizeMjSubmitModalPromptLine(stripMjDescribeLeadImageUrl(s)))
    .filter(Boolean)

  const dropUrlOnly = (s: string) => !(s.length < 400 && /^https?:\/\/\S+$/i.test(s))

  const filtered = lines.filter(dropUrlOnly)
  if (filtered.length >= 4) return filtered.slice(0, 4)
  if (filtered.length >= 2 && filtered.length <= 4) return filtered

  const one = stripMjDescribeLeadImageUrl(raw)
  const byBar = one
    .split(/\s*(?:\|\|\|?|｜｜)\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 12)
  if (byBar.length >= 2) return byBar.slice(0, 4)

  return filtered.length ? filtered.slice(0, 4) : []
}

export type MjDescribeChoiceRow = {
  index: number
  customId: string
  btn: MjFollowBtn
  /** 展示用：优先来自上游多行解析，否则为按钮文案 */
  displayPrompt: string
}

/**
 * Describe 成功任务：将「操作按钮」与「解析出的咒语行」对齐，供弹窗展示与单条 submit/action。
 * 优先保留 U1–U4 类（排除 V 与重抽）；不足再退回前 4 个非重抽按钮。
 */
function sortDescribePickButtons(pick: MjFollowBtn[]): MjFollowBtn[] {
  if (!pick.length) return pick
  const L = (b: MjFollowBtn) => String(b.label || '').trim()
  if (pick.every(b => /^U[1-4]$/i.test(L(b)))) {
    return [...pick].sort(
      (a, b) =>
        Number(/^U([1-4])$/i.exec(L(a))?.[1] ?? '0') - Number(/^U([1-4])$/i.exec(L(b))?.[1] ?? '0')
    )
  }
  if (pick.every(b => /^[1-4]$/.test(L(b)))) {
    return [...pick].sort((a, b) => Number(L(a)) - Number(L(b)))
  }
  return pick
}

export function extractMjDescribeChoiceRows(
  task: Record<string, unknown> | undefined,
  opts?: { promptLabel?: string }
): MjDescribeChoiceRow[] {
  if (!task || !isMjDescribeResultJob(task, opts)) return []

  /** 部分上游 Describe 用「1–4」按钮且 customId 为空；须保留以便与任务卡、弹窗对齐 */
  const btns = collectMjTaskButtonsFlat(task).filter(b => {
    if (btnIsRegenerate(b)) return false
    const cid = String(b.customId || '').trim()
    const lab = String(b.label || '').trim()
    if (cid) return true
    return /^[1-4]$/.test(lab) || /^U[1-4]$/i.test(lab)
  })

  const isUpscale = (b: MjFollowBtn) => /^U[1-4]$/i.test(String(b.label || '').trim())
  const isVar = (b: MjFollowBtn) => /^V[1-4]$/i.test(String(b.label || '').trim())

  let pick = btns.filter(b => isUpscale(b) && !isVar(b))
  if (pick.length < 4) {
    const digits = btns.filter(b => /^[1-4]$/.test(String(b.label || '').trim()) && !isVar(b))
    if (digits.length >= 4) {
      pick = sortDescribePickButtons(digits).slice(0, 4)
    } else {
      pick = btns.filter(b => !isVar(b))
    }
  }
  /** 同一 customId 重复时只保留首次；无 customId 时按 label 去重 */
  const seenKey = new Set<string>()
  pick = pick.filter(b => {
    const c = String(b.customId || '').trim()
    const lab = String(b.label || '').trim()
    const key = c || `lab:${lab}`
    if (seenKey.has(key)) return false
    seenKey.add(key)
    return true
  })
  pick = sortDescribePickButtons(pick).slice(0, 4)
  if (!pick.length) return []

  const lines = splitMjDescribePromptLines(pickDescribePromptBlob(task))

  return pick.map((btn, i) => {
    const labelPretty = (formatMjUpstreamButtonLabel(btn.label) || String(btn.label || '')).trim()
    const displayPrompt = (lines[i] || labelPretty || `—`).trim()
    return {
      index: i + 1,
      customId: String(btn.customId || '').trim(),
      btn,
      displayPrompt,
    }
  })
}

/**
 * 任务卡 / 下拉中的某枚按钮是否对应 Describe 四条候选之一（用于改填图像描述而非误 submit）。
 */
export function findMjDescribeChoiceRowForButton(
  task: Record<string, unknown> | undefined,
  btn: MjFollowBtn,
  opts?: { promptLabel?: string }
): MjDescribeChoiceRow | undefined {
  if (!task || !btn) return undefined
  const rows = extractMjDescribeChoiceRows(task, opts)
  if (!rows.length) return undefined
  const cid = String(btn.customId || '').trim()
  const lab = String(btn.label || '').trim()
  if (cid) {
    const byCid = rows.find(r => r.customId === cid)
    if (byCid) return byCid
  }
  const u = /^U([1-4])$/i.exec(lab)
  if (u) {
    const i = Number(u[1]) - 1
    return rows[i]
  }
  if (/^[1-4]$/.test(lab)) {
    const i = Number(lab) - 1
    return rows[i]
  }
  return undefined
}
