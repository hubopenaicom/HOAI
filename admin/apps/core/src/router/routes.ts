import type { RouteRecordMainRaw } from '@fantastic-admin/types'
import type { RouteRecordRaw } from 'vue-router'
import pinia from '@/store'
import AppMenu from './modules/app.menu'
import ChatMenu from './modules/chat.menu'
import AiMenu from './modules/model.menu'
import PackageMenu from './modules/package.menu'
import PayMenu from './modules/pay.menu'
import SecureMenu from './modules/secure.menu'
import StorageMenu from './modules/storage.menu'
import SystemMenu from './modules/system.menu'
import UserMenu from './modules/user.menu'

// 固定路由（默认路由）
const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login.vue'),
    meta: {
      title: '登录',
      icon: 'i-mdi:login',
    },
  },
  {
    path: '/:all(.*)*',
    name: 'notFound',
    component: () => import('@/views/[...all].vue'),
    meta: {
      title: '找不到页面',
      icon: 'i-mdi:file-question-outline',
    },
  },
]

// 系统路由
const systemRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/index.vue'),
    meta: {
      breadcrumb: false,
    },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/index.vue'),
        meta: {
          title: useAppSettingsStore(pinia).settings.app.home.title,
          icon: 'i-ant-design:home-twotone',
          breadcrumb: false,
        },
      },
      {
        path: 'reload',
        name: 'reload',
        component: () => import('@/views/reload.vue'),
        meta: {
          title: '重新加载中...',
          icon: 'i-mdi:refresh',
          breadcrumb: false,
        },
      },
      {
        path: 'setting',
        name: 'personalSetting',
        component: () => import('@/views/personal/setting.vue'),
        meta: {
          title: '个人设置',
          icon: 'i-mdi:account-cog-outline',
          cache: 'personalEditPassword',
        },
      },
      {
        path: 'edit/password',
        name: 'personalEditPassword',
        component: () => import('@/views/personal/edit.password.vue'),
        meta: {
          title: '修改密码',
          icon: 'i-mdi:form-textbox-password',
        },
      },
    ],
  },
]

// 动态路由（异步路由、导航菜单路由）
// side 模式下每个顶层项对应一组主导航；meta 为分组标题与图标（与 basic 演示结构一致）
const asyncRoutes: RouteRecordMainRaw[] = [
  {
    meta: {
      title: '平台配置',
      icon: 'i-ri:settings-3-line',
      sort: 100,
    },
    children: [
      SystemMenu,
      UserMenu,
      SecureMenu,
      StorageMenu,
    ],
  },
  {
    meta: {
      title: '业务运营',
      icon: 'i-ri:pulse-line',
      sort: 90,
    },
    children: [
      AiMenu,
      ChatMenu,
      AppMenu,
      PackageMenu,
      PayMenu,
    ],
  },
]

export {
  asyncRoutes,
  constantRoutes,
  systemRoutes,
}
