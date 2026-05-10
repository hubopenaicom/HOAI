import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/chat',
  component: Layout,
  redirect: '/chat/chat',
  name: 'chatMenu',
  meta: {
    title: '数据管理',
    icon: 'i-mdi:chart-timeline-variant',
  },
  children: [
    {
      path: 'dashboard',
      name: 'dashboardMenu',
      component: () => import('@/views/users/index.vue'),
      meta: {
        title: '用户信息',
        icon: 'i-mdi:format-list-numbered',
      },
    },
    {
      path: 'list',
      name: 'chatMenuList',
      component: () => import('@/views/chat/chat.vue'),
      meta: {
        title: '对话记录',
        icon: 'i-mdi:message-outline',
      },
    },
    {
      path: 'drawing-mj',
      name: 'drawingMjAdmin',
      component: () => import('@/views/chat/drawingMj.vue'),
      meta: {
        title: '绘画管理',
        icon: 'i-mdi:palette-outline',
      },
    },
    {
      path: 'auto-reply',
      name: 'ReplyMenuList',
      component: () => import('@/views/sensitive/autpReply.vue'),
      meta: {
        title: '内容预设',
        icon: 'i-mdi:comment-question-outline',
      },
    },
  ],
};

export default routes;
