import apiUser from '@/api/modules/user'
import router from '@/router'
import { ElMessage } from 'element-plus'

export const useAppAccountStore = defineStore('appAccount', () => {
  const appSettingsStore = useAppSettingsStore()
  const appTabbarStore = useAppTabbarStore()
  const appRouteStore = useAppRouteStore()
  const appMenuStore = useAppMenuStore()

  const token = ref(localStorage.token ?? '')
  const account = ref(localStorage.username ?? '')
  const avatar = ref('')

  const permissions = ref<string[]>([])

  const isLogin = computed(() => Boolean(token.value))

  async function getInfo() {
    const res = await apiUser.getInfo()
    const { userInfo } = res.data
    localStorage.setItem('username', userInfo.username)
    const { role } = userInfo
    account.value = userInfo.username
    avatar.value = userInfo.avatar ?? ''
    if (!['admin', 'super'].includes(role)) {
      ElMessage.error('您没有权限访问该系统!!!')
      await logout()
    }
  }

  async function login(data: { username: string; password: string }) {
    const res = await apiUser.login(data)
    localStorage.setItem('token', res.data)
    token.value = res.data
    await getInfo()
  }

  function logout(redirect = router.currentRoute.value.fullPath) {
    localStorage.removeItem('username')
    localStorage.removeItem('token')
    token.value = ''
    account.value = ''
    return router.push({
      name: 'login',
      query: {
        ...(redirect !== appSettingsStore.settings.app.home.fullPath && router.currentRoute.value.name !== 'login' && { redirect }),
      },
    }).then(logoutCleanStatus)
  }

  function requestLogout() {
    localStorage.removeItem('token')
    token.value = ''
    return router.push({
      name: 'login',
      query: {
        ...(
          router.currentRoute.value.fullPath !== appSettingsStore.settings.app.home.fullPath
          && router.currentRoute.value.name !== 'login'
          && {
            redirect: router.currentRoute.value.fullPath,
          }
        ),
      },
    }).then(logoutCleanStatus)
  }

  function logoutCleanStatus() {
    avatar.value = ''
    permissions.value = []
    appSettingsStore.updateSettings({}, true)
    appTabbarStore.clean()
    appRouteStore.removeRoutes()
    appMenuStore.setActived(0)
  }

  async function getPermissions() {
    const res = await apiUser.permission()
    const { userInfo } = res.data
    const { username: name } = userInfo
    localStorage.setItem('username', name)
    account.value = name

    permissions.value = [
      'permission.browse',
      'permission.create',
      'permission.edit',
      'permission.remove',
    ]
    return permissions.value
  }

  async function editPassword(data: { password: string; newPassword: string }) {
    await apiUser.passwordEdit({
      oldPassword: data.password,
      password: data.newPassword,
    })
  }

  function lock() {
    localStorage.removeItem('token')
  }

  function unlock() {
    localStorage.setItem('token', token.value)
  }

  return {
    token,
    account,
    avatar,
    permissions,
    isLogin,
    login,
    logout,
    requestLogout,
    getPermissions,
    getInfo,
    editPassword,
    lock,
    unlock,
  }
})
