import { onUnmounted, ref, type Ref } from 'vue'

/**
 * 频谱可视化：默认用 CSS/RAF 模拟，避免 createMediaElementSource 导致 HTMLAudio 无声。
 * 若后续需要真实频谱，可在用户手势后单独接入且失败时回退。
 */
export function useMusicAudioAnalyser(_audioRef: Ref<HTMLAudioElement | null>) {
  const barHeights = ref<number[]>(new Array(16).fill(0.15))
  const isActive = ref(false)
  let raf = 0
  let phase = 0

  function tick() {
    phase += 0.14
    const next: number[] = []
    for (let i = 0; i < barHeights.value.length; i++) {
      const wave = 0.35 + 0.25 * Math.sin(phase + i * 0.55) + 0.2 * Math.sin(phase * 1.7 + i * 0.9)
      next.push(Math.max(0.12, Math.min(1, wave)))
    }
    barHeights.value = next
    raf = requestAnimationFrame(tick)
  }

  function start() {
    if (raf) return
    isActive.value = true
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    isActive.value = false
    barHeights.value = barHeights.value.map(h => Math.max(0.12, h * 0.7))
  }

  function teardown() {
    stop()
  }

  onUnmounted(teardown)

  return { barHeights, isActive, start, stop, teardown }
}
