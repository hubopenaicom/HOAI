import type { InjectionKey, Ref } from 'vue'

export interface MusicAudioContext {
  audioRef: Ref<HTMLAudioElement | null>
  currentTime: Ref<number>
  duration: Ref<number>
  isPlaying: Ref<boolean>
  playingClipId: Ref<string | undefined>
}

export const MUSIC_AUDIO_KEY: InjectionKey<MusicAudioContext> = Symbol('musicAudio')
