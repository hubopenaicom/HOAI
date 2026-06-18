export interface AlignedWord {
  word?: string
  start_s?: number
  end_s?: number
  success?: boolean
}

export interface LyricsWordToken {
  text: string
  startS: number
  endS: number
}

export interface LyricsLine {
  id: string
  text: string
  isTag: boolean
  startS: number
  endS: number
  words: LyricsWordToken[]
}

function isWordRecord(v: unknown): v is AlignedWord {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return 'word' in o || 'start_s' in o || 'end_s' in o
}

/** 从多种网关/包装结构中提取 aligned_words */
export function extractAlignedWords(data: unknown): AlignedWord[] {
  if (!data) return []
  const queue: unknown[] = [data]
  const seen = new Set<unknown>()

  while (queue.length) {
    const cur = queue.shift()
    if (!cur || seen.has(cur)) continue
    seen.add(cur)

    if (Array.isArray(cur)) {
      if (cur.length && isWordRecord(cur[0])) return cur as AlignedWord[]
      continue
    }

    if (typeof cur !== 'object') continue
    const o = cur as Record<string, unknown>

    if (Array.isArray(o.aligned_words) && o.aligned_words.length) {
      return o.aligned_words as AlignedWord[]
    }

    if (Array.isArray(o.words) && o.words.length && isWordRecord(o.words[0])) {
      return o.words as AlignedWord[]
    }

    const code = String(o.code ?? o.status ?? '').toLowerCase()
    if (code === 'success' || code === 'ok') {
      if (o.data != null) queue.push(o.data)
    }

    for (const key of ['data', 'result', 'timing', 'payload']) {
      if (o[key] != null) queue.push(o[key])
    }
  }

  return []
}

export function formatLyricsTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function formatLyricsTimeRange(startS: number, endS: number): string {
  if (!Number.isFinite(startS) || !Number.isFinite(endS) || endS <= 0) return '—'
  return `${formatLyricsTime(startS)} - ${formatLyricsTime(endS)}`
}

/** 将 Suno timing 的逐词对齐数据合并为带词级时间戳的歌词行 */
export function buildLyricsLinesFromAlignedWords(words: AlignedWord[]): LyricsLine[] {
  if (!words.length) return []

  const lines: LyricsLine[] = []
  let lineIdx = 0
  let currentWords: LyricsWordToken[] = []
  let lineStart = 0
  let lineEnd = 0

  const pushLine = () => {
    const text = currentWords
      .map(w => w.text)
      .join('')
      .trim()
    if (!text) {
      currentWords = []
      return
    }
    const isTag = /^\[[^\]]+\]$/.test(text)
    lines.push({
      id: `l-${lineIdx++}`,
      text,
      isTag,
      startS: lineStart,
      endS: Math.max(lineEnd, lineStart),
      words: isTag ? [] : [...currentWords],
    })
    currentWords = []
    lineStart = 0
    lineEnd = 0
  }

  for (const w of words) {
    const part = String(w.word ?? '')
    const start = Number(w.start_s ?? 0)
    const end = Number(w.end_s ?? start)

    if (!currentWords.length) lineStart = start

    if (part.includes('\n')) {
      const segments = part.split('\n')
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i] ?? ''
        if (seg) {
          currentWords.push({ text: seg, startS: start, endS: end })
          lineEnd = Math.max(lineEnd, end)
        }
        if (i < segments.length - 1) {
          pushLine()
          if (seg) lineStart = start
        }
      }
    } else if (part) {
      currentWords.push({ text: part, startS: start, endS: end })
      lineEnd = Math.max(lineEnd, end)
    }
  }

  pushLine()
  return lines
}

/** 无 timing 时从 prompt 文本解析 [Verse] 等结构 */
export function buildLyricsLinesFromPrompt(prompt: string): LyricsLine[] {
  const raw = (prompt || '').trim()
  if (!raw) return []
  return raw
    .split('\n')
    .map((line, i) => {
      const text = line.trim()
      const isTag = /^\[[^\]]+\]$/.test(text)
      return {
        id: `p-${i}`,
        text,
        isTag,
        startS: 0,
        endS: 0,
        words: [],
      }
    })
    .filter(l => l.text)
}

export function findActiveLineIndex(lines: LyricsLine[], timeS: number): number {
  if (!lines.length || !Number.isFinite(timeS)) return -1
  const timed = lines.filter(l => !l.isTag && l.endS > 0)
  if (!timed.length) return lines.findIndex(l => !l.isTag)
  for (let i = timed.length - 1; i >= 0; i--) {
    if (timeS >= timed[i].startS - 0.05) {
      return lines.findIndex(l => l.id === timed[i].id)
    }
  }
  return lines.findIndex(l => !l.isTag)
}

/** 当前行内正在播放的词索引（逐字高亮） */
export function findActiveWordIndex(line: LyricsLine, timeS: number): number {
  if (!line.words.length || !Number.isFinite(timeS)) return -1
  for (let i = line.words.length - 1; i >= 0; i--) {
    const w = line.words[i]!
    if (timeS >= w.startS - 0.04) return i
  }
  return -1
}

export function isWordActive(
  line: LyricsLine,
  wordIdx: number,
  lineIdx: number,
  activeLineIdx: number,
  timeS: number
): 'past' | 'current' | 'future' {
  if (lineIdx !== activeLineIdx) {
    return lineIdx < activeLineIdx && activeLineIdx >= 0 ? 'past' : 'future'
  }
  const activeWord = findActiveWordIndex(line, timeS)
  if (activeWord < 0) return 'future'
  if (wordIdx < activeWord) return 'past'
  if (wordIdx === activeWord) return 'current'
  return 'future'
}
