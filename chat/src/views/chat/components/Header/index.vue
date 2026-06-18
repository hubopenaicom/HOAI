<script lang="ts" setup>
import { fetchQueryOneCatAPI } from '@/api/appStore'
import { DropdownMenu, MenuItem } from '@/components/common/DropdownMenu'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { Brightness, Close, DarkMode, EditTwo, ExpandLeft } from '@icon-park/vue-next'
import DownSmall from '@icon-park/vue-next/es/icons/DownSmall'
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface ExternalLink {
  icon?: string
  name?: string
  [key: string]: any
}

const useGlobalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const chatStore = useChatStore()
const route = useRoute()
const router = useRouter()
const navMenuOpen = ref(false)
const appDetail: any = ref(null)
const dataSources = computed(() => chatStore.groupList)
const collapsed = computed(() => appStore.siderCollapsed)
const darkMode = computed(() => appStore.theme === 'dark')

const { isMobile } = useBasicLayout()
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const listSources = computed(() => chatStore.chatList)

// 计算预览器状态
const isPreviewerVisible = computed(
  () =>
    useGlobalStore.showHtmlPreviewer ||
    useGlobalStore.showTextEditor ||
    useGlobalStore.showImagePreviewer
)

// 计算应用广场状态
const isAppListVisible = computed(() => useGlobalStore.showAppListComponent)

function checkMode() {
  const mode = darkMode.value ? 'light' : 'dark'
  appStore.setTheme(mode)
}

/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

watch(
  activeAppId,
  val => {
    if (val) queryAppDetail(val)
    else appDetail.value = null
  },
  { immediate: true }
)

/* 查询当前app详情提示用户使用 */
async function queryAppDetail(id: number) {
  const res: any = await fetchQueryOneCatAPI({ id })
  appDetail.value = res.data
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

async function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

// 关闭应用广场
function closeAppList() {
  useGlobalStore.updateShowAppListComponent(false)
  // 在移动端不自动展开侧边栏
  if (!isMobile.value) {
    appStore.setSiderCollapsed(false)
  }
}

const externalLinkActive = computed(
  () => useGlobalStore.externalLinkDialog && useGlobalStore.currentExternalLink
)
const currentExternalLink = computed(() => {
  const link = useGlobalStore.currentExternalLink
  return (typeof link === 'object' ? link : {}) as ExternalLink
})

// 打开文本编辑器
const openTextEditor = () => {
  useGlobalStore.updateTextEditor(true)
}

function openSettings(tab?: number) {
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, tab)
    appStore.setSiderCollapsed(true)
  } else {
    useGlobalStore.updateSettingsDialog(true, tab)
  }
}

const headerTitle = computed(() => {
  if (route.path === '/drawing') return t('nav.drawingPageTitle')
  if (route.path === '/music') return t('nav.musicPageTitle')
  return activeGroupInfo.value?.title || t('chat.newConversation')
})

const isChatRoute = computed(() => route.path === '/' || route.name === 'Chat')
const isDrawingRoute = computed(() => route.path === '/drawing' || route.name === 'Drawing')
const isMusicRoute = computed(() => route.path === '/music' || route.name === 'Music')

function goChat(close?: () => void) {
  navMenuOpen.value = false
  close?.()
  if (!isChatRoute.value) router.push({ name: 'Chat' })
}

function goDrawing(close?: () => void) {
  navMenuOpen.value = false
  close?.()
  if (!isDrawingRoute.value) router.push({ name: 'Drawing' })
}

function goMusic(close?: () => void) {
  navMenuOpen.value = false
  close?.()
  if (!isMusicRoute.value) router.push({ name: 'Music' })
}
</script>

<template>
  <header class="sticky top-0 left-0 right-0 z-30 dark:border-neutral-800 h-16 select-none">
    <div class="relative flex items-center justify-center min-w-0 h-full">
      <div class="flex w-full h-full items-center" :class="{ 'px-4': !isMobile, 'px-2': isMobile }">
        <div
          v-if="collapsed && !externalLinkActive && !isPreviewerVisible"
          class="relative group mx-1"
        >
          <button
            type="button"
            class="btn-icon btn-md"
            @click="handleUpdateCollapsed"
            aria-label="展开侧边栏"
          >
            <ExpandLeft size="22" />
          </button>
          <!-- 悬停提示 - 展开侧边栏 -->
          <div v-if="!isMobile" class="tooltip tooltip-right">展开侧栏</div>
        </div>

        <!-- pc -->
        <div class="flex justify-between items-center h-full w-full">
          <!-- 当外部链接激活时显示链接信息，否则显示模型选择 -->
          <div
            v-if="externalLinkActive"
            class="relative flex-1 flex ele-drag items-center justify-between h-full"
          >
            <div class="py-1 flex items-center space-x-2">
              <img
                v-if="currentExternalLink && currentExternalLink.icon"
                :src="currentExternalLink.icon"
                alt="网站图标"
                class="w-6 h-6 rounded-lg object-cover"
              />
              <div v-else class="w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center">
                <span class="text-xs">{{ currentExternalLink?.name?.charAt(0) || '?' }}</span>
              </div>
              <span
                class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate whitespace-nowrap overflow-hidden max-w-[30vw]"
              >
                {{ currentExternalLink?.name || '外部链接' }}
              </span>
            </div>
          </div>

          <!-- 模型选择在输入区；顶栏：导航菜单 + 当前标题 -->
          <div v-else class="flex-1 flex items-center min-w-0">
            <DropdownMenu
              v-model="navMenuOpen"
              position="bottom-left"
              min-width="220px"
              class="min-w-0 max-w-full"
            >
              <template #trigger="{ isOpen }">
                <button
                  type="button"
                  class="menu-trigger max-w-full flex items-center gap-1 text-left"
                  :aria-expanded="isOpen"
                  aria-haspopup="menu"
                  :aria-label="t('nav.openMenu')"
                >
                  <span class="truncate whitespace-nowrap overflow-hidden max-w-[50vw]">
                    {{ headerTitle }}
                  </span>
                  <DownSmall
                    class="shrink-0 w-4 h-4 opacity-70 transition-transform duration-200"
                    :class="{ 'rotate-180': isOpen }"
                    aria-hidden="true"
                  />
                </button>
              </template>
              <template #menu="{ close }">
                <MenuItem :title="t('nav.chat')" :active="isChatRoute" @click="goChat(close)" />
                <MenuItem
                  :title="t('nav.drawing')"
                  :active="isDrawingRoute"
                  @click="goDrawing(close)"
                />
                <MenuItem :title="t('nav.music')" :active="isMusicRoute" @click="goMusic(close)" />
              </template>
            </DropdownMenu>
          </div>

          <div class="flex items-center">
            <!-- 主题切换按钮，仅在非外部链接和非预览器状态下显示 -->
            <div v-if="!externalLinkActive && !isPreviewerVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="checkMode()"
                aria-label="切换主题"
              >
                <Brightness v-if="!darkMode" size="20" aria-hidden="true" />
                <DarkMode v-else size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 切换主题 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">切换主题</div>
            </div>

            <!-- 工具链接组件，在非预览器状态、非外部链接状态、非应用广场状态下显示 -->
            <ToolLinks v-if="!externalLinkActive && !isPreviewerVisible && !isAppListVisible" />

            <!-- 文本编辑器按钮 -->
            <div v-if="false" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="openTextEditor"
                aria-label="文本编辑器"
              >
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 文本编辑器 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">文本编辑器</div>
            </div>

            <!-- 外部链接状态下显示关闭按钮，应用广场状态下显示关闭按钮，否则显示新对话按钮 -->
            <div v-if="externalLinkActive" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="
                  () => {
                    useGlobalStore.updateExternalLinkDialog(false)
                    if (!isMobile) {
                      appStore.setSiderCollapsed(false)
                    }
                  }
                "
                aria-label="关闭外部链接"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 关闭 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭</div>
            </div>
            <div v-else-if="isAppListVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="closeAppList"
                aria-label="关闭应用广场"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 关闭 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭</div>
            </div>
            <div v-else-if="!isPreviewerVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="createNewChatGroup()"
                :disabled="listSources.length === 0 && !activeAppId && dataSources.length !== 0"
                aria-label="新建对话"
              >
                <EditTwo size="20" aria-hidden="true" />
              </button>
              <!-- 悬停提示 - 新对话 -->
              <div v-if="!isMobile" class="tooltip tooltip-bottom">新建对话</div>
            </div>

            <!-- 登录用户 - 直接点击打开设置对话框 -->
            <!-- <div
              v-if="isLogin"
              @click="openSettings(undefined)"
              class="flex items-center cursor-pointer group relative mr-3"
              role="button"
              aria-label="打开设置中心"
              tabindex="0"
            >
              <div
                class="w-8 h-8 ml-1 rounded-full bg-primary-500 overflow-hidden flex items-center justify-center shadow-sm"
              >
                <img
                  v-if="avatar"
                  :src="avatar"
                  class="w-full h-full object-cover"
                  alt="用户头像"
                />
                <User
                  v-if="!avatar"
                  theme="outline"
                  size="18"
                  class="text-white"
                  aria-hidden="true"
                />
              </div>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">设置</div>
            </div> -->
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
