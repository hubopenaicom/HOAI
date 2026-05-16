import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/package',
  component: Layout,
  redirect: '/package/list',
  name: 'packageMenu',
  meta: {
    title: '套餐管理',
    icon: 'i-icon-park-outline:buy',
  },
  children: [
    {
      path: 'order-list',
      name: 'OrderMenuList',
      component: () => import('@/views/order/index.vue'),
      meta: {
        title: '订单列表',
        icon: 'i-mdi:clipboard-list-outline',
      },
    },
    {
      path: 'account-log',
      name: 'AccountLogMenu',
      component: () => import('@/views/users/accountLog.vue'),
      meta: {
        title: '账户明细',
        icon: 'i-mdi:account-circle-outline',
      },
    },
    {
      path: 'security-log',
      name: 'UserSecurityLogMenu',
      component: () => import('@/views/users/securityLog.vue'),
      meta: {
        title: '安全审计日志',
        icon: 'i-mdi:shield-account-outline',
      },
    },
    {
      path: 'list',
      name: 'packageMenuList',
      component: () => import('@/views/package/package.vue'),
      meta: {
        title: '套餐设置',
        icon: 'i-icon-park-outline:commodity',
      },
    },
    {
      path: 'crami',
      name: 'cramiMenuList',
      component: () => import('@/views/package/crami.vue'),
      meta: {
        title: '卡密管理',
        icon: 'i-mdi:key-variant',
      },
    },
  ],
};

export default routes;
