import { setSettings } from '@fantastic-admin/settings'

export default setSettings({
  menu: {
    mode: 'side',
    mainMenuClickMode: 'switch',
    subMenuUniqueExpand: true,
    subMenuCollapse: false,
    subMenuCollapseButton: true,
    hotkeys: false,
  },
  app: {
    dynamicTitle: true,
    copyright: {
      enable: false,
    },
  },
  topbar: {
    mode: 'static',
    tabbar: false,
    toolbar: true,
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
