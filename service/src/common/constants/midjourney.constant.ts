/**
 * 任务状态枚举 1: 等待中 2: 绘制中 3: 绘制完成 4: 绘制失败 5: 绘制超时
 */
export enum MidjourneyStatusEnum {
  WAITING = 1,
  DRAWING = 2,
  DRAWED = 3,
  DRAWFAIL = 4,
  DRAWTIMEOUT = 5,
}

/** 轮询上游 `/task/{id}/fetch` 的间隔（毫秒），与绘画页前端保持一致 */
export const MJ_UPSTREAM_POLL_INTERVAL_MS = 2500;

/**
 * 单次出图最大轮询次数（× {@link MJ_UPSTREAM_POLL_INTERVAL_MS} ≈ 总等待上限）。
 * 旧逻辑 120 次仅约 5 分钟，Relax/高峰队列常见仍为 RUNNING，导致误报超时。
 * - fast/turbo：480 次 ≈ 20 分钟
 * - relax：720 次 ≈ 30 分钟
 */
export function mjUpstreamPollMaxIterations(mjMode: string | undefined): number {
  const m = String(mjMode ?? 'fast').toLowerCase();
  if (m === 'relax') return 720;
  return 480;
}

/**
 * 绘画动作枚举 1: 绘画 2: 放大 3: 变换 4: 图生图 5: 重新生成 6： 无线缩放  7: 单张变化【很大|微小】
 */
export enum MidjourneyActionEnum {
  DRAW = 1,
  UPSCALE = 2,
  VARIATION = 3,
  GENERATE = 4,
  REGENERATE = 5,
  VARY = 6,
  ZOOM = 7,
}
