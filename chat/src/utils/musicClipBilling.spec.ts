import { describe, expect, it } from 'vitest'
import { estimateMusicJobDeduct, formatMusicDeductPoints } from '@/utils/musicClipBilling'

describe('musicClipBilling', () => {
  it('estimates deduct from model and multiplier', () => {
    const out = estimateMusicJobDeduct({ deduct: 10, deductType: 2 }, 2)
    expect(out).toEqual({ deductCharged: 20, deductTypeSnapshot: 2, chargeMult: 2 })
  })

  it('returns only chargeMult when model has no deduct', () => {
    expect(estimateMusicJobDeduct(undefined, 1)).toEqual({ chargeMult: 1 })
  })

  it('formats deduct points with translated type label', () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'chat.ordinaryPoints': '普通积分',
        'chat.points': '积分',
        'music.detailDeductPoints': '{n} {typeName}',
      }
      let out = map[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          out = out.replace(`{${k}}`, String(v))
        }
      }
      return out
    }
    expect(formatMusicDeductPoints(1, 1, t)).toBe('1 普通积分')
  })
})
