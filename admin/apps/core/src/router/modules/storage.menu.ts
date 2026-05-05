import type { RouteRecordRaw } from 'vue-router';

function Layout() {
  return import('@/layouts/index.vue');
}

const routes: RouteRecordRaw = {
  path: '/storage',
  component: Layout,
  redirect: '/storage/config',
  name: 'StorageMenu',
  meta: {
    title: '存储配置',
    icon: 'i-mdi:database-outline',
  },
  children: [
    {
      path: 'localStorage',
      name: 'LocalStorage',
      component: () => import('@/views/storage/localStorage.vue'),
      meta: {
        title: '本地存储',
        icon: 'i-icon-park-outline:cloud-storage',
      },
    },
    {
      path: 's3',
      name: 'StorageS3',
      component: () => import('@/views/storage/s3.vue'),
      meta: {
        title: 'S3存储',
        icon: 'i-mdi:cloud-outline',
      },
    },
    {
      path: 'tencent',
      name: 'StorageTencent',
      component: () => import('@/views/storage/tencent.vue'),
      meta: {
        title: '腾讯云COS',
        icon: 'i-mdi:cloud-upload-outline',
      },
    },
    {
      path: 'ali',
      name: 'StorageAli',
      component: () => import('@/views/storage/ali.vue'),
      meta: {
        title: '阿里云OSS',
        icon: 'i-mdi:harddisk',
      },
    },
    // {
    //   path: 'chevereto',
    //   name: 'StorageChevereto',
    //   component: () => import('@/views/storage/chevereto.vue'),
    //   meta: {
    //     title: 'chevereto图床',
    //     icon: 'i-material-symbols:image-outline',
    //   },
    // },
  ],
};

export default routes;
