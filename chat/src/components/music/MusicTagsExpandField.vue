<script setup lang="ts">
import MusicIcon from '@/components/music/MusicIcon.vue'
import { t } from '@/locales'

withDefaults(
  defineProps<{
    tags: string
    expanding?: boolean
    result?: string
    /** inline: 创作区标签行；stack: 工具页独立面板 */
    layout?: 'inline' | 'stack'
    label?: string
    placeholder?: string
    showResult?: boolean
  }>(),
  { layout: 'inline', showResult: true }
)

const emit = defineEmits<{
  'update:tags': [string]
  expand: []
}>()
</script>

<template>
  <div
    class="music-tags-expand"
    :class="`music-tags-expand--${layout}`"
    :aria-busy="expanding || undefined"
  >
    <label v-if="label" class="music-form-label">{{ label }}</label>

    <div class="music-tags-expand__row">
      <input
        :value="tags"
        type="text"
        class="music-input music-tags-expand__input"
        :class="layout === 'inline' ? 'flex-1 text-sm' : ''"
        :placeholder="placeholder"
        :disabled="expanding"
        @input="emit('update:tags', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="music-btn-secondary music-btn-sm music-tags-expand__btn shrink-0"
        :class="{ 'music-btn--with-spinner': expanding }"
        :disabled="expanding || !tags.trim()"
        :aria-label="expanding ? t('music.tagsExpanding') : t('music.tagsExpand')"
        @click.prevent="emit('expand')"
      >
        <span v-if="expanding" class="music-spin music-tags-expand__btn-spin" aria-hidden="true" />
        <MusicIcon v-else name="sparkles" :size="14" class="music-tags-expand__btn-icon" />
        <span>{{ expanding ? t('music.tagsExpanding') : t('music.tagsExpand') }}</span>
      </button>
    </div>

    <div v-if="expanding" class="music-tags-expand-status" role="status" aria-live="polite">
      <span class="music-page-loading__orb music-tags-expand-status__orb" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="music-tags-expand-status__title">{{ t('music.tagsExpandingTitle') }}</p>
        <p class="music-tags-expand-status__hint">{{ t('music.tagsExpandingHint') }}</p>
      </div>
    </div>

    <div v-else-if="showResult && result" class="music-tags-expand-result">
      <p class="music-tags-expand-result__label">
        <MusicIcon name="sparkles" :size="12" class="music-tags-expand-result__icon" />
        {{ t('music.toolsTagsResult') }}
      </p>
      <p class="music-tags-expand-result__text">{{ result }}</p>
    </div>
  </div>
</template>
