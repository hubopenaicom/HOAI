import type { MjSpeedMode } from '@/api/drawingMj'
import {
  DEFAULT_MJ_IMAGINE_CHARGE_MULTIPLIERS,
  guessMjImagineMultFromPrompt,
  parseMjImagineChargeMultipliersJson,
  type MjImagineChargeMultipliersParsed,
} from '@/utils/mj-imagine-charge-mult'

export { parseMjImagineChargeMultipliersJson, type MjImagineChargeMultipliersParsed }

/** 与 `drawing-mj.service` 中 `guessChargeMultiplier` 对齐（Imagine / Shorten 等按提示词推断倍数） */
export function guessMjImagineChargeMultiplier(
  prompt: string,
  mults: MjImagineChargeMultipliersParsed = DEFAULT_MJ_IMAGINE_CHARGE_MULTIPLIERS
): number {
  return guessMjImagineMultFromPrompt(prompt, mults)
}

export interface MjChargeDrawingModelLike {
  drawingType: number
  deduct: number
  deductMjFast?: number | null
  deductMjTurbo?: number | null
  deductMjRelax?: number | null
  deductType: number
}

/**
 * 与 `drawing-mj.service` 中 `mjBaseDeductPerUnit` 对齐：MJ 模型按速度取基准，否则退回 `deduct`。
 */
export function mjBaseDeductForDrawingModel(
  m: MjChargeDrawingModelLike,
  mode: MjSpeedMode
): number {
  const pick = (v: number | null | undefined): number | null => {
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const fallbackRaw = Number(m.deduct)
  const fallback = Number.isFinite(fallbackRaw) && fallbackRaw >= 0 ? fallbackRaw : 0
  if (Number(m.drawingType) !== 3) return fallback
  let chosen: number | null = null
  if (mode === 'relax') chosen = pick(m.deductMjRelax)
  else if (mode === 'turbo') chosen = pick(m.deductMjTurbo)
  else chosen = pick(m.deductMjFast)
  return chosen ?? fallback
}

/** 与 `withBalance` 一致：基准 × 倍数（与后端相同，不做额外取整） */
export function mjEstimatedDeductTotal(
  m: MjChargeDrawingModelLike,
  mode: MjSpeedMode,
  mult: number
): number {
  const base = mjBaseDeductForDrawingModel(m, mode)
  const mlt = Number.isFinite(mult) && mult > 0 ? mult : 1
  return base * mlt
}
