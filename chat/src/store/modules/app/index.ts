import { store } from '@/store'
import { defineStore } from 'pinia'
import type { AppState, Language, Theme } from './helper'
import { getLocalSetting, setLocalSetting } from './helper'

export const useAppStore = defineStore('app-store', {
  state: (): AppState => getLocalSetting(),
  actions: {
    setSiderCollapsed(collapsed: boolean) {
      this.siderCollapsed = collapsed
      this.recordState()
    },

    setTheme(theme: Theme) {
      localStorage.theme = theme
      this.theme = theme
      window.theme = theme
      this.recordState()
      // 与 useTheme / themes/*.css 一致：同时更新 class 与 data-theme，避免仅一侧更新导致主内容区变量与 Tailwind 脱节
      const root = document.documentElement
      root.dataset.theme = theme
      root.classList.toggle('dark', theme === 'dark')
    },

    setLanguage(language: Language) {
      if (this.language !== language) {
        this.language = language
        this.recordState()
      }
    },

    recordState() {
      setLocalSetting(this.$state)
    },

    setEnv() {
      const isWeChat = /micromessenger/i.test(navigator.userAgent)

      const isElectron = navigator.userAgent.includes('Electron')

      const isMobile = /(iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone)/i.test(
        navigator.userAgent
      )

      const isWeb = !isWeChat && !isElectron

      if (isWeChat) this.env = 'wechat'
      else if (isElectron) this.env = 'electron'
      else if (isMobile) this.env = 'mobile'
      else if (isWeb) this.env = 'web'
    },
  },
})

export function useAppStoreWithOut() {
  return useAppStore(store)
}
