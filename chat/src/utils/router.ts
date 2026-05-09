import { useChatStore } from '@/store'
import { STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING } from '@/utils/drawingClientStorage'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

function groupIsDrawingMj(configStr: string | undefined | null): boolean {
  if (!configStr) return false
  try {
    const c = JSON.parse(configStr) as { modelInfo?: { drawingType?: number } }
    return Number(c?.modelInfo?.drawingType) === 3
  } catch {
    return false
  }
}

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Chat',
    component: () => import('@/views/chat/chat.vue'),
  },
  {
    path: '/drawing',
    name: 'Drawing',
    component: () => import('@/views/drawing/index.vue'),
  },
  {
    path: '/:catchAll(.*)',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const chatStore = useChatStore()
  try {
    if (from.name === 'Chat' && to.name === 'Drawing') {
      const id = chatStore.active
      if (id)
        sessionStorage.setItem(STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING, String(Number(id)))
    }
    if (from.name === 'Drawing' && to.name === 'Chat') {
      const raw = sessionStorage.getItem(STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING)
      sessionStorage.removeItem(STORAGE_KEY_PREV_CHAT_BEFORE_DRAWING)
      await chatStore.queryMyGroup()
      if (raw) {
        const prevId = Number(raw)
        if (prevId > 0 && !Number.isNaN(prevId)) {
          const exists = chatStore.groupList.some(
            item => Number(item.uuid) === prevId
          )
          if (exists) await chatStore.setActiveGroup(prevId)
        }
      } else {
        /** 直达绘画页或未缓存返回 id 时，当前 active 可能是绘画组，切换到首个非绘画对话组 */
        const cur = chatStore.groupList.find(
          item => Number(item.uuid) === Number(chatStore.active)
        )
        const activeIsMj =
          cur && groupIsDrawingMj(typeof cur.config === 'string' ? cur.config : null)
        if (activeIsMj) {
          const fallback = chatStore.groupList.find(
            item => !groupIsDrawingMj(typeof item.config === 'string' ? item.config : null)
          )
          if (fallback) await chatStore.setActiveGroup(fallback.uuid)
          else if (chatStore.groupList[0])
            await chatStore.setActiveGroup(chatStore.groupList[0].uuid)
        }
      }
    }
  } catch {
    /* ignore */
  }
  next()
})

export default router
