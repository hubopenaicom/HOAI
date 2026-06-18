import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED,
  STORAGE_KEY_MUSIC_SELECTED_MV,
  loadMusicClipsCache,
  loadStoredSunoMv,
} from '@/utils/musicClientStorage'

function mockLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  return store
}

describe('loadStoredSunoMv', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = mockLocalStorage()
  })

  afterEach(() => {
    store.clear()
  })

  it('returns chirp-fenix when nothing stored', () => {
    expect(loadStoredSunoMv()).toBe('chirp-fenix')
    expect(localStorage.getItem(STORAGE_KEY_MUSIC_SELECTED_MV)).toBe('chirp-fenix')
  })

  it('migrates legacy implicit chirp-auk to chirp-fenix once', () => {
    localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MV, 'chirp-auk')
    expect(loadStoredSunoMv()).toBe('chirp-fenix')
    expect(localStorage.getItem(STORAGE_KEY_MUSIC_SELECTED_MV)).toBe('chirp-fenix')
    localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MV, 'chirp-auk')
    localStorage.setItem(STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED, '2')
    expect(loadStoredSunoMv()).toBe('chirp-fenix')
  })

  it('migrates chirp-auk-turbo on first v2 migration', () => {
    localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MV, 'chirp-auk-turbo')
    expect(loadStoredSunoMv()).toBe('chirp-fenix')
  })

  it('keeps user-selected non-legacy mv', () => {
    localStorage.setItem(STORAGE_KEY_MUSIC_SELECTED_MV, 'chirp-bluejay')
    localStorage.setItem(STORAGE_KEY_MUSIC_MV_LEGACY_MIGRATED, '1')
    expect(loadStoredSunoMv()).toBe('chirp-bluejay')
  })

  it('discovers newest scoped clips cache when userId missing', () => {
    const older = {
      clips: [{ id: 'a', clipId: '1', title: 'Old', status: 'complete', createdAt: 1 }],
      savedAt: 100,
    }
    const newer = {
      clips: [{ id: 'b', clipId: '2', title: 'New', status: 'complete', createdAt: 2 }],
      savedAt: 200,
    }
    localStorage.setItem('hoai_music_clips_cache_v1_userA', JSON.stringify(older))
    localStorage.setItem('hoai_music_clips_cache_v1_userB', JSON.stringify(newer))
    const clips = loadMusicClipsCache()
    expect(clips).toHaveLength(1)
    expect(clips[0]?.id).toBe('b')
  })
})
