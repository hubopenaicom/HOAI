<script setup lang="ts">
import { t } from '@/locales'
import type { MusicModeHelpContext } from '@/utils/musicModeHelp'
import { computed } from 'vue'

const props = defineProps<{
  context: MusicModeHelpContext
  contextKey: string
  /** 工具-上传：动态 mv / 大小提示 */
  extraLines?: string[]
}>()

const tips = computed(() => props.context.tipKeys.filter(Boolean))
</script>

<template>
  <section
    :key="contextKey"
    class="music-mode-help"
    role="region"
    :aria-label="t('music.modeHelpPanelAria')"
  >
    <header class="music-mode-help__header">
      <div class="music-mode-help__title-row">
        <h3 class="music-mode-help__title">{{ t(context.titleKey) }}</h3>
        <span v-if="context.sceneKey" class="music-mode-help__scene">
          {{ t(context.sceneKey) }}
        </span>
      </div>
    </header>

    <p class="music-mode-help__body">{{ t(context.bodyKey) }}</p>

    <ul v-if="tips.length" class="music-mode-help__tips">
      <li v-for="key in tips" :key="key">{{ t(key) }}</li>
    </ul>

    <p v-for="(line, i) in extraLines" :key="'extra-' + i" class="music-mode-help__extra">
      {{ line }}
    </p>

    <p v-if="context.mvPolicyKey" class="music-mode-help__mv" role="note">
      {{ t(context.mvPolicyKey) }}
    </p>
  </section>
</template>
