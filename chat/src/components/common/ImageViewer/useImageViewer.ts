import { App, ref } from 'vue'
import ImageViewer from './index.vue'

// 全局状态
const isVisible = ref(false)
const currentImageUrl = ref('')
const currentFileName = ref('image')
const currentCaptionOriginal = ref('')
const currentCaptionTranslated = ref('')

// 图片预览器实例
export interface ImageViewerOptions {
  imageUrl: string
  fileName?: string
  /** 画面描述（用户提示） */
  captionOriginal?: string
  /** 翻译 / 英文等副文案 */
  captionTranslated?: string
}

// 打开图片预览器
export function openImageViewer(options: ImageViewerOptions) {
  currentImageUrl.value = options.imageUrl
  currentFileName.value = options.fileName || 'image'
  currentCaptionOriginal.value = options.captionOriginal?.trim() ?? ''
  currentCaptionTranslated.value = options.captionTranslated?.trim() ?? ''
  isVisible.value = true
}

// 关闭图片预览器
export function closeImageViewer() {
  isVisible.value = false
  currentImageUrl.value = ''
  currentFileName.value = 'image'
  currentCaptionOriginal.value = ''
  currentCaptionTranslated.value = ''
}

// 图片预览器状态
export function useImageViewer() {
  return {
    isVisible,
    currentImageUrl,
    currentFileName,
    currentCaptionOriginal,
    currentCaptionTranslated,
    openImageViewer,
    closeImageViewer,
  }
}

// 全局安装插件
export default {
  install(app: App) {
    // 注册全局组件
    app.component('ImageViewer', ImageViewer)

    // 注册全局方法
    app.config.globalProperties.$imageViewer = {
      open: openImageViewer,
      close: closeImageViewer,
    }

    // 提供全局状态
    app.provide('imageViewer', useImageViewer())
  },
}
