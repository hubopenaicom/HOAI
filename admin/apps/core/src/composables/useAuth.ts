export default function useAuth() {
  function hasPermission(permission: string) {
    const appSettingsStore = useAppSettingsStore()
    const appAccountStore = useAppAccountStore()
    if (appSettingsStore.settings.app.account?.auth) {
      return appAccountStore.permissions.includes(permission)
    }
    return true
  }

  function auth(value: string | string[]) {
    let authResult
    if (typeof value === 'string') {
      authResult = value !== '' ? hasPermission(value) : true
    }
    else {
      authResult = value.length > 0 ? value.some(item => hasPermission(item)) : true
    }
    return authResult
  }

  function authAll(value: string[]) {
    return value.length > 0 ? value.every(item => hasPermission(item)) : true
  }

  return {
    auth,
    authAll,
  }
}
