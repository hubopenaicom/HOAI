import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import dayjs from 'dayjs'
import { defineConfig, loadEnv } from 'vite'
import { parseLoadedEnv } from 'vite-plugin-env-parse'
import pkg from './package.json'
import createVitePlugins from './vite/plugins'

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = parseLoadedEnv(loadEnv(mode, process.cwd()))
  // 全局 scss 资源
  const scssResources: string[] = []
  fs.readdirSync('src/assets/styles/resources').forEach((dirname) => {
    if (fs.statSync(`src/assets/styles/resources/${dirname}`).isFile()) {
      scssResources.push(`@use "/src/assets/styles/resources/${dirname}" as *;`)
    }
  })
  const basePath = (typeof env.VITE_BASE_PATH === 'string' && env.VITE_BASE_PATH.length > 0)
    ? env.VITE_BASE_PATH
    : '/'

  return {
    // 必须与子路径部署一致（Nest 挂载 ADMIN_SERVE_ROOT=/admin），否则资源从站点根加载导致 404、一直载入中
    base: basePath,
    // 开发服务器选项 https://cn.vitejs.dev/config/server-options
    server: {
      open: false,
      host: true,
      port: 9000,
      proxy: {
        '/proxy': {
          target: env.VITE_APP_API_BASEURL,
          changeOrigin: command === 'serve' && (env.VITE_ENABLE_PROXY || env.VITE_OPEN_PROXY),
          rewrite: path => path.replace(/\/proxy/, ''),
        },
      },
    },
    // 构建选项 https://cn.vitejs.dev/config/build-options
    build: {
      outDir: mode === 'production' ? 'dist' : `dist-${mode}`,
      sourcemap: env.VITE_BUILD_SOURCEMAP,
    },
    define: {
      __SYSTEM_INFO__: JSON.stringify({
        pkg: {
          version: pkg.version,
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
        },
        lastBuildTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      }),
    },
    plugins: createVitePlugins(mode, command === 'build'),
    optimizeDeps: {
      exclude: ['@fantastic-admin/components'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '#': path.resolve(__dirname, 'src/types'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: scssResources.join(''),
        },
      },
    },
  }
})
