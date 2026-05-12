/**
 * Midjourney 侧栏「高级参数」与 prompt 后缀的版本可见性 / 是否拼接。
 *
 * 主要对照 Midjourney Docs（https://docs.midjourney.com/）：
 * - Parameter List、Version、Style Reference、Character Reference、Omni Reference、
 *   Draft Mode、Omni Reference 中与其它参数的组合限制等。
 * 上游若变更以官方为准。
 *
 * **本仓库绘画侧栏未覆盖的官方能力（非「漏实现版本门控」）** 示例：
 * 视频参数（--video、--motion、--loop、--end、--bs）、Stealth/Public、Personalization（--p）、
 * 部分仅 Web/Discord 工作流的能力；这些不在当前 Imagine/Blend/Spell 产品范围内。
 */

export type MjUiStyle = 'realistic' | 'anime'
export type MjUiRealisticVer = '6' | '7' | '8'
export type MjUiNijiVer = '6' | '7'

/** 角色参考 --cref / --cw：写实 **仅 V6**（V7 起上游拒绝 `--cref`+`--v 7`，请用 Omni `--oref`）；Niji 仅 6；V8 / Niji 7 隐藏 */
export function mjVersionSupportsCref(
  style: MjUiStyle,
  realisticVersion: MjUiRealisticVer,
  nijiVersion: MjUiNijiVer
): boolean {
  if (style === 'realistic') {
    return realisticVersion === '6'
  }
  return nijiVersion === '6'
}

/** 风格参考 --sref / --sw / --sv：写实 V6–V8、Niji 6/7 均展示（V8.x 文档仍强调 sref / moodboard） */
export function mjVersionSupportsSref(
  style: MjUiStyle,
  realisticVersion: MjUiRealisticVer,
  nijiVersion: MjUiNijiVer
): boolean {
  if (style === 'realistic') {
    return realisticVersion === '6' || realisticVersion === '7' || realisticVersion === '8'
  }
  return nijiVersion === '6' || nijiVersion === '7'
}

/** Omni --oref / --ow：仅写实 V7（V8 与 Niji 在说明中多列为不支持或替代工作流） */
export function mjVersionSupportsOref(
  style: MjUiStyle,
  realisticVersion: MjUiRealisticVer,
  _nijiVersion: MjUiNijiVer
): boolean {
  return style === 'realistic' && realisticVersion === '7'
}

/** 草稿 --draft：仅写实 V7；V8.1 等上游常返回 Draft 不支持，故侧栏不在 V8 展示 */
export function mjVersionSupportsDraft(
  style: MjUiStyle,
  realisticVersion: MjUiRealisticVer,
  _nijiVersion: MjUiNijiVer
): boolean {
  return style === 'realistic' && realisticVersion === '7'
}

/**
 * --sv 可选档位（含「关」0）。与官方 Style Reference 文档一致处已收紧：
 * - 写实 / 主模型 **V6**：官方为 **4** 种子版本 → `--sv` **1～4**（默认档为 4）。
 * - 写实 **V7**：官方为 **6** 种子版本（图像 sref）→ **1～6**（文档写默认 **6**；旧码用 **4**）。
 * - 写实 **V8 / V8.1**：官方 Version 页与 release 材料常列 **6**；**7** 多见于 V8.1 说明（与 V8.0 下 `--hd`/`--q 4` 等组合限制并存），侧栏保留 **6、7**。
 * - **Niji 6**：与 V6 相同矩阵处理为 **1～4**（官方 Style Reference 页将 Niji 6 与 V6/V7 一并列入 sref，V6 子版本表为 1–4）。
 * - **Niji 7**：官方未在 Style Reference 页给出与 V7 同级的完整 `--sv` 表；保守保留 **6**（与此前防报错策略一致）。
 */
export function mjSvPickerChoices(
  style: MjUiStyle,
  realisticVersion: MjUiRealisticVer,
  nijiVersion: MjUiNijiVer
): number[] {
  if (style === 'realistic' && realisticVersion === '8') {
    return [0, 6, 7]
  }
  if (style === 'realistic' && realisticVersion === '7') {
    return [0, 1, 2, 3, 4, 5, 6]
  }
  if (style === 'realistic' && realisticVersion === '6') {
    return [0, 1, 2, 3, 4]
  }
  if (style === 'anime' && nijiVersion === '6') {
    return [0, 1, 2, 3, 4]
  }
  if (style === 'anime' && nijiVersion === '7') {
    return [0, 6]
  }
  return [0, 1, 2, 3, 4, 5, 6]
}

/** 当前组合下是否允许将 n 写入 prompt（n 为四舍五入后的整数） */
export function mjVersionSupportsSvValue(
  style: MjUiStyle,
  realisticVersion: MjUiRealisticVer,
  nijiVersion: MjUiNijiVer,
  sv: number
): boolean {
  const n = Math.round(sv)
  if (n < 1 || n > 7) return false
  return mjSvPickerChoices(style, realisticVersion, nijiVersion).includes(n)
}
