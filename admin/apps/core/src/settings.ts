import { setSettings } from '@fantastic-admin/settings'

export default setSettings({
  theme: {
    colorScheme: 'light',
    /** 卡片与控件圆角：略放大以配合扁平壳层的精致感 */
    radius: 0.5,
    colorAmblyopia: false,
  },
  menu: {
    mode: 'side',
    mainMenuClickMode: 'switch',
    subMenuUniqueExpand: true,
    subMenuCollapse: false,
    subMenuCollapseButton: true,
    hotkeys: true,
  },
  app: {
    dynamicTitle: true,
    copyright: {
      enable: false,
    },
  },
  topbar: {
    mode: 'static',
    tabbar: true,
    toolbar: true,
  },
  tabbar: {
    icon: true,
    hotkeys: true,
  },
  toolbar: {
    breadcrumb: true,
    fullscreen: false,
    pageReload: true,
    menuSearch: {
      enable: true,
      hotkeys: true,
    },
    colorScheme: true,
  },
})
