export type MusicIconName =
  | 'waveform'
  | 'play'
  | 'pause'
  | 'skip-back'
  | 'skip-forward'
  | 'sparkles'
  | 'upload'
  | 'download'
  | 'copy'
  | 'stems'
  | 'lyrics'
  | 'extend'
  | 'remix'
  | 'scissors'
  | 'refresh'
  | 'mic'
  | 'piano'
  | 'layers'
  | 'link'
  | 'user'
  | 'wand'
  | 'disc'
  | 'close'
  | 'music'
  | 'film'
  | 'clock'
  | 'volume'

export interface MusicIconShape {
  paths?: string[]
  circles?: Array<{ cx: number; cy: number; r: number }>
  lines?: Array<{ x1: number; y1: number; x2: number; y2: number }>
  polylines?: string[]
}

/** Lucide-style stroke icons (24×24 viewBox) */
export const MUSIC_ICONS: Record<MusicIconName, MusicIconShape> = {
  waveform: {
    paths: ['M9 18V5l12-2v13', 'M6 21V9', 'M3 21V13'],
    circles: [{ cx: 18, cy: 16, r: 3 }],
  },
  play: {
    paths: ['M5 5a2 2 0 0 1 3.3-1.5l11 7a2 2 0 0 1 0 3.3l-11 7A2 2 0 0 1 5 19z'],
  },
  pause: {
    lines: [
      { x1: 10, y1: 6, x2: 10, y2: 18 },
      { x1: 14, y1: 6, x2: 14, y2: 18 },
    ],
  },
  'skip-back': {
    paths: ['M6 6h2v12H6z', 'M9 12l10-6v12z'],
  },
  'skip-forward': {
    paths: ['M16 6h2v12h-2z', 'M5 6l10 6-10 6z'],
  },
  sparkles: {
    paths: [
      'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      'M20 3v4',
      'M22 5h-4',
    ],
  },
  upload: {
    paths: ['M12 3v12', 'M7 8l5-5 5 5', 'M5 21h14'],
  },
  download: {
    paths: ['M12 15V3', 'M7 10l5 5 5-5', 'M5 21h14'],
  },
  copy: {
    paths: [
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      'M12 2H8a2 2 0 0 0-2 2v2h10V4a2 2 0 0 0-2-2z',
    ],
  },
  stems: {
    paths: ['M12 3v18', 'M3 8h4v8H3z', 'M17 6h4v12h-4z'],
  },
  lyrics: {
    paths: ['M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'],
    lines: [
      { x1: 8, y1: 13, x2: 16, y2: 13 },
      { x1: 8, y1: 17, x2: 13, y2: 17 },
    ],
  },
  extend: {
    paths: ['M5 12h14', 'M13 6l6 6-6 6'],
  },
  remix: {
    paths: [
      'M16 3h5v5',
      'M8 3H3v5',
      'M21 16v5h-5',
      'M3 16v5h5',
      'M21 8a9 9 0 0 0-9 9',
      'M3 16a9 9 0 0 1 9-9',
    ],
  },
  scissors: {
    circles: [
      { cx: 6, cy: 6, r: 3 },
      { cx: 6, cy: 18, r: 3 },
    ],
    paths: ['M8.12 8.12 20 20', 'M8.12 15.88 20 4'],
  },
  refresh: {
    paths: ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
  },
  mic: {
    paths: [
      'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z',
      'M19 10v2a7 7 0 0 1-14 0v-2',
      'M12 19v3',
    ],
    lines: [{ x1: 8, y1: 22, x2: 16, y2: 22 }],
  },
  piano: {
    paths: ['M4 19h16', 'M6 19V7', 'M10 19V7', 'M14 19V7', 'M18 19V7'],
  },
  layers: {
    paths: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  },
  link: {
    paths: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
  },
  user: {
    paths: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'],
    circles: [{ cx: 12, cy: 7, r: 4 }],
  },
  wand: {
    paths: [
      'M15 4V2',
      'M15 16v-2',
      'M8 9h2',
      'M20 9h2',
      'M17.8 11.8 19 13',
      'M15 9h0',
      'M17.8 6.2 19 5',
      'M3 21l9-9',
    ],
  },
  disc: {
    circles: [
      { cx: 12, cy: 12, r: 10 },
      { cx: 12, cy: 12, r: 3 },
    ],
  },
  close: {
    lines: [
      { x1: 18, y1: 6, x2: 6, y2: 18 },
      { x1: 6, y1: 6, x2: 18, y2: 18 },
    ],
  },
  music: {
    paths: ['M9 18V5l12-2v13'],
    circles: [{ cx: 6, cy: 18, r: 3 }],
  },
  film: {
    paths: ['M4 4h16v16H4z', 'M4 8h16', 'M4 16h16', 'M9 4v16', 'M15 4v16'],
  },
  clock: {
    circles: [{ cx: 12, cy: 12, r: 10 }],
    paths: ['M12 6v6l4 2'],
  },
  volume: {
    paths: [
      'M11 5 6 9H2v6h4l5 4V5z',
      'M15.54 8.46a5 5 0 0 1 0 7.07',
      'M19.07 4.93a10 10 0 0 1 0 14.14',
    ],
  },
}

/** Map edit/process action modes to icons */
export const MUSIC_EDIT_ICON: Record<string, MusicIconName> = {
  extend: 'extend',
  reference: 'remix',
  infill: 'scissors',
  rewrite: 'refresh',
  overpainting: 'lyrics',
  underpainting: 'piano',
  add_vocals: 'mic',
  persona_sing: 'user',
  cover: 'disc',
}

export const MUSIC_PROCESS_ICON: Record<string, MusicIconName> = {
  vocal_stems: 'stems',
  all_stems: 'layers',
  midi: 'piano',
}
