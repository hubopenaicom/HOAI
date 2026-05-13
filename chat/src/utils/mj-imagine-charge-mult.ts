/**
 * Midjourney Imagine / Shorten 等按提示词推断的扣费倍数（与独立绘画页、对话内 MJ 一致）。
 * 配置键：`mjImagineChargeMultipliers`（JSON 字符串，见后台「网站显示配置」）。
 * 服务端副本：`service/src/modules/drawingMj/mj-imagine-charge-mult.ts`，修改时请同步两处。
 */
export type MjImagineChargeMultipliersParsed = {
  v8: number
  v7: number
  niji7: number
  draft: number
  default: number
}

export const DEFAULT_MJ_IMAGINE_CHARGE_MULTIPLIERS: MjImagineChargeMultipliersParsed = {
  v8: 8,
  v7: 8,
  niji7: 8,
  draft: 2,
  default: 4,
}

export function parseMjImagineChargeMultipliersJson(
  raw: string | undefined | null
): MjImagineChargeMultipliersParsed {
  const d: MjImagineChargeMultipliersParsed = { ...DEFAULT_MJ_IMAGINE_CHARGE_MULTIPLIERS }
  if (!raw || typeof raw !== 'string') return d
  const t = raw.trim()
  if (!t) return d
  try {
    const o = JSON.parse(t) as Record<string, unknown>
    const apply = (k: keyof MjImagineChargeMultipliersParsed) => {
      const v = o[k]
      if (v === undefined || v === null) return
      const n = Number(v)
      if (Number.isFinite(n) && n >= 1 && n <= 1000) d[k] = Math.floor(n)
    }
    apply('v8')
    apply('v7')
    apply('niji7')
    apply('draft')
    apply('default')
  } catch {
    /* 非法 JSON 时保留默认/已解析字段 */
  }
  return d
}

export function guessMjImagineMultFromPrompt(
  prompt: string,
  mults: MjImagineChargeMultipliersParsed
): number {
  if (!prompt || !String(prompt).trim()) return 1
  if (prompt.includes('--v 8')) return mults.v8
  if (prompt.includes('--v 7')) return mults.v7
  if (prompt.includes('--niji 7')) return mults.niji7
  if (prompt.includes('--draft')) return mults.draft
  return mults.default
}
