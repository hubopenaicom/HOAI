<script lang="ts" setup name="Login">
  import type { FormInstance, FormRules } from 'element-plus';
  import ColorScheme from '@/layouts/components/Topbar/Toolbar/ColorScheme/index.vue';

  const route = useRoute();
  const router = useRouter();
  const appAccountStore = useAppAccountStore();
  const appSettingsStore = useAppSettingsStore();

  const title = import.meta.env.VITE_APP_TITLE;

  const formType = ref('login');
  const loading = ref(false);
  const redirect = ref(route.query.redirect?.toString() ?? '/');

  const loginFormRef = ref<FormInstance>();
  const loginForm = ref({
    username: localStorage.login_username || '',
    password: '',
    remember: !!localStorage.login_username,
  });
  const loginRules = ref<FormRules>({
    username: [{ required: true, trigger: 'blur', message: '请输入用户名' }],
    password: [
      { required: true, trigger: 'blur', message: '请输入密码' },
      { min: 6, max: 18, trigger: 'blur', message: '密码长度为6到18位' },
    ],
  });

  function handleLogin() {
    loginFormRef.value &&
      loginFormRef.value.validate((valid) => {
        if (valid) {
          loading.value = true;
          appAccountStore
            .login(loginForm.value)
            .then(() => {
              loading.value = false;
              if (loginForm.value.remember) {
                localStorage.setItem('login_username', loginForm.value.username);
              } else {
                localStorage.removeItem('login_username');
              }
              router.push(redirect.value);
            })
            .catch(() => {
              loading.value = false;
            });
        }
      });
  }
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-background">
    <div class="bg-banner" />
    <div
      class="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border bg-background p-1 text-base"
    >
      <ColorScheme v-if="appSettingsStore.settings.toolbar.colorScheme" />
    </div>

    <div class="login-box center absolute z-1 shadow-md rounded-md">
      <div class="login-form flex w-full max-w-md flex-col justify-center px-8 py-10 md:px-12">
        <div class="mb-2 flex items-center gap-2">
          <img src="@/assets/images/logo.svg" class="h-8 w-8 rounded-lg border p-0.5" alt="" >
          <span class="text-lg font-semibold tracking-tight text-foreground">{{ title }}</span>
        </div>
        <p class="mb-8 text-sm text-muted-foreground">
          使用管理员账号登录控制台
        </p>

        <el-form
          v-show="formType === 'login'"
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          class="login-form w-full"
          autocomplete="on"
        >
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="用户名"
              text
              tabindex="1"
              autocomplete="on"
              size="large"
              class="h-11"
            >
              <template #prefix>
                <el-icon>
                  <SvgIcon name="ep:user" />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="密码"
              tabindex="2"
              autocomplete="on"
              show-password
              size="large"
              class="h-11"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <el-icon>
                  <SvgIcon name="ep:lock" />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>
          <div class="mb-6 flex items-center justify-between">
            <el-checkbox v-model="loginForm.remember" size="large">记住我</el-checkbox>
          </div>
          <FaButton
            class="w-full"
            size="lg"
            :loading="loading"
            @click.prevent="handleLogin"
          >
            登录
          </FaButton>
        </el-form>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .bg-banner {
    position: fixed;
    z-index: 0;
    width: 100%;
    height: 100%;
    background:
      radial-gradient(closest-side, oklch(var(--border) / 10%) 30%, oklch(var(--primary) / 20%) 30%, oklch(var(--border) / 30%) 50%) no-repeat,
      radial-gradient(closest-side, oklch(var(--border) / 10%) 30%, oklch(var(--primary) / 20%) 30%, oklch(var(--border) / 30%) 50%) no-repeat;
    background-position: 100% 100%, 0% 0%;
    background-size: 200vw 200vh;
    filter: blur(100px);
  }

  .login-box {
    display: flex;
    overflow: hidden;
    background-color: oklch(var(--background));
  }

  .login-box.center {
    top: 50%;
    left: 50%;
    max-width: min(100vw - 2rem, 520px);
    width: 100%;
    transform: translate(-50%, -50%);
    border-radius: 0.375rem;
    border: 1px solid oklch(var(--border) / 0.6);
  }

  [data-mode='mobile'] .login-box.center {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin: 5rem auto 2rem;
    max-width: calc(100vw - 2rem);
  }
</style>
