<template>
  <ImageViewer
    v-model:visible="isVisible"
    :image-url="currentImageUrl"
    :file-name="currentFileName"
    :caption-original="currentCaptionOriginal"
    :caption-translated="currentCaptionTranslated"
    @close="handleClose"
  />
</template>

<script setup lang="ts">
import ImageViewer from './index.vue'
import { useImageViewer } from './useImageViewer'

const {
  isVisible,
  currentImageUrl,
  currentFileName,
  currentCaptionOriginal,
  currentCaptionTranslated,
  closeImageViewer,
} = useImageViewer()

function handleClose() {
  closeImageViewer()
}
</script>
