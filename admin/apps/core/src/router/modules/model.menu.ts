import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/ai',
  component: Layout,
  redirect: '/ai/chat-key-list',
  name: 'AiMenu',
  meta: {
    title: '模型管理',
    icon: 'i-mdi:book-open-outline',
  },
  children: [
    {
      path: 'keys',
      name: 'AiMenuKeys',
      component: () => import('@/views/models/key.vue'),
      meta: { title: '模型设置', icon: 'i-mdi:robot-outline' },
    },
    {
      path: 'baseSetting',
      name: 'baseSetting',
      component: () => import('@/views/models/baseSetting.vue'),
      meta: {
        title: '基础配置',
        icon: 'i-ep:setting',
      },
    },
  ],
};

export default routes;
