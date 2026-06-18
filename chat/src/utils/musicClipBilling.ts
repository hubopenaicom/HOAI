import type { SunoMusicModel } from '@/api/sunoMusic'

export function estimateMusicJobDeduct(
  model: Pick<SunoMusicModel, 'deduct' | 'deductType'> | undefined,
  chargeMult: number
): {
  deductCharged?: number
  deductTypeSnapshot?: number
  chargeMult: number
} {
  const mult = Number.isFinite(chargeMult) && chargeMult > 0 ? chargeMult : 1
  const base = Number(model?.deduct)
  if (!Number.isFinite(base) || base <= 0) return { chargeMult: mult }
  return {
    deductCharged: Math.round(base * mult),
    deductTypeSnapshot:
      model?.deductType != null && Number.isFinite(Number(model.deductType))
        ? Number(model.deductType)
        : undefined,
    chargeMult: mult,
  }
}

/** 扣费类型 → i18n key（与对话/绘画页一致，位于 chat 命名空间） */
export function musicDeductTypeLabelKey(deductType?: number): string | undefined {
  if (deductType === 1) return 'chat.ordinaryPoints'
  if (deductType === 2) return 'chat.advancedPoints'
  if (deductType === 3) return 'chat.drawingPoints'
  return undefined
}

export function formatMusicDeductPoints(
  deductCharged?: number,
  deductType?: number,
  t: (key: string, params?: Record<string, unknown>) => string
): string {
  if (deductCharged == null || !Number.isFinite(deductCharged)) return ''
  const typeKey = musicDeductTypeLabelKey(deductType)
  const typeName = typeKey ? t(typeKey) : t('chat.points')
  const translated = t('music.detailDeductPoints', { n: deductCharged, typeName })
  // 若 typeName 未被翻译（键不存在），避免把 i18n key 直接展示给用户
  if (typeKey && translated.includes(typeKey)) {
    return t('music.detailDeductPoints', { n: deductCharged, typeName: t('chat.points') })
  }
  return translated
}
