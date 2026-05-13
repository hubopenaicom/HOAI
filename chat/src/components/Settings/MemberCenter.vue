<script setup lang="ts">
import { fetchGetPackageAPI, fetchUseCramiAPI } from '@/api/crami'
import { fetchGetConsumptionLogAPI, fetchGetModelTokenUsageAPI } from '@/api/balance'
import { fetchOrderBuyAPI } from '@/api/order'
import { fetchSignInAPI, fetchSignLogAPI } from '@/api/signin'
import { fetchGetJsapiTicketAPI } from '@/api/user'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { message } from '@/utils/message'
import { computed, onBeforeUnmount, onMounted, ref, Teleport, watch } from 'vue'
import { useRouter } from 'vue-router'

import type { ResData } from '@/api/types'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import MemberPayment from './MemberPayment.vue'

const props = defineProps<Props>()

declare let WeixinJSBridge: any
declare let wx: any

const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const loading = ref(true)
const packageList = ref<Pkg[]>([])
const ms = message()
const dialogLoading = ref(false)
const model3Name = computed(() => authStore.globalConfig.model3Name || t('goods.basicModelQuota'))
const { isMobile } = useBasicLayout()
const model4Name = computed(
  () => authStore.globalConfig.model4Name || t('goods.advancedModelQuota')
)
const drawMjName = computed(() => authStore.globalConfig.drawMjName || t('goods.drawingQuota'))
const isHideModel3Point = computed(() => Number(authStore.globalConfig.isHideModel3Point) === 1)
const isHideModel4Point = computed(() => Number(authStore.globalConfig.isHideModel4Point) === 1)
const isHideDrawMjPoint = computed(() => Number(authStore.globalConfig.isHideDrawMjPoint) === 1)
const isWxEnv = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase()
  return ua.match(/MicroMessenger/i) && ua?.match(/MicroMessenger/i)?.[0] === 'micromessenger'
})
const payPlatform = computed(() => {
  const {
    payHupiStatus,
    payEpayStatus,
    payMpayStatus,
    payWechatStatus,
    payLtzfStatus,
    payDuluPayStatus,
  } = authStore.globalConfig
  if (Number(payWechatStatus) === 1) return 'wechat'

  if (Number(payMpayStatus) === 1) return 'mpay'

  if (Number(payHupiStatus) === 1) return 'hupi'

  if (Number(payEpayStatus) === 1) return 'epay'

  if (Number(payLtzfStatus) === 1) return 'ltzf'

  if (Number(payDuluPayStatus) === 1) return 'dulu'

  return null
})

const payChannel = computed(() => {
  const { payEpayChannel, payMpayChannel } = authStore.globalConfig
  if (payPlatform.value === 'mpay') return payMpayChannel ? JSON.parse(payMpayChannel) : []

  if (payPlatform.value === 'epay') return payEpayChannel ? JSON.parse(payEpayChannel) : []

  if (payPlatform.value === 'wechat') return ['wxpay']

  if (payPlatform.value === 'hupi') return ['hupi']

  if (payPlatform.value === 'dulu') return ['dulu']

  if (payPlatform.value === 'ltzf') return ['wxpay']

  return []
})

interface Props {
  visible: boolean
}

interface Pkg {
  id: number
  name: string
  coverImg: string
  des: string
  price: number
  model3Count: number
  model4Count: number
  drawMjCount: number
  extraReward: number
  extraPaintCount: number
  createdAt: Date
}

onMounted(() => {
  if (props.visible) {
    // 组件挂载时检查登录状态
    if (checkLoginStatus()) {
      openDrawerAfter()
      if (isWxEnv.value) jsapiInitConfig()
    }
  }
})

// 二级页面控制
const activeView = ref('main') // 'main'或'payment'
const selectedPackage = ref<Pkg | null>(null)

// 切换到支付页面
function showPaymentView(pkg: Pkg) {
  selectedPackage.value = pkg
  useGlobalStore.updateOrderInfo({ pkgInfo: pkg })
  activeView.value = 'payment'
}

// 返回主视图
function backToMainView() {
  activeView.value = 'main'
  selectedPackage.value = null
}

// 处理支付成功
function handlePaymentSuccess() {
  ms.success(t('goods.purchaseSuccess'))
  activeView.value = 'main'
  selectedPackage.value = null

  // 刷新用户信息
  authStore.getUserInfo()

  // 关闭设置对话框
  setTimeout(() => {
    useGlobalStore.updateSettingsDialog(false)
  }, 2000)
}

onBeforeUnmount(() => {
  packageList.value = []
  loading.value = true

  // 确保返回主视图，清理资源
  activeView.value = 'main'
  selectedPackage.value = null
})

/* 微信环境jsapi注册 */
async function jsapiInitConfig() {
  const url = window.location.href.replace(/#.*$/, '')
  const res = (await fetchGetJsapiTicketAPI({ url })) as ResData
  const { appId, nonceStr, timestamp, signature } = res.data
  if (!appId) return

  wx.config({
    debug: false,
    appId,
    timestamp,
    nonceStr,
    signature,
    jsApiList: ['chooseWXPay'],
  })
  wx.ready(() => {})
  wx.error(() => {})
}

function onBridgeReady(data: {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}) {
  const { appId, timeStamp, nonceStr, package: pkg, signType, paySign } = data
  WeixinJSBridge.invoke(
    'getBrandWCPayRequest',
    {
      appId,
      timeStamp,
      nonceStr,
      package: pkg,
      signType,
      paySign,
    },
    (res: any) => {
      if (res.err_msg === 'get_brand_wxpay_request:ok') {
        ms.success(t('goods.purchaseSuccess'))
        setTimeout(() => {
          authStore.getUserInfo()
        }, 500)
      } else {
        ms.success(t('goods.paymentNotSuccessful'))
      }
    }
  )
}

async function handleBuyGoods(pkg: Pkg) {
  if (dialogLoading.value) return

  // 判断是否是微信移动端环境
  function isWxMobileEnv() {
    const ua = window.navigator.userAgent.toLowerCase()
    // 微信环境
    const isWxEnv = ua.indexOf('micromessenger') !== -1
    // 非PC端
    const isMobile = ua.indexOf('windows') === -1 && ua.indexOf('macintosh') === -1
    return isWxEnv && isMobile
  }

  // 如果是微信环境判断有没有开启微信支付，开启了则直接调用jsapi支付即可
  if (
    isWxMobileEnv() &&
    payPlatform.value === 'wechat' &&
    Number(authStore.globalConfig.payWechatStatus) === 1
  ) {
    if (typeof WeixinJSBridge == 'undefined') {
      // 使用事件监听器而不是直接传递回调函数
      const bridgeReadyHandler = () => {
        // 在回调中使用onBridgeReady函数处理支付
        const handlePayment = async () => {
          const res: ResData = await fetchOrderBuyAPI({
            goodsId: pkg.id,
            payType: 'jsapi',
          })
          const { success, data } = res
          if (success) onBridgeReady(data)
        }
        handlePayment()
      }

      if (document.addEventListener) {
        document.addEventListener('WeixinJSBridgeReady', bridgeReadyHandler as EventListener, false)
      }
    } else {
      const res: ResData = await fetchOrderBuyAPI({
        goodsId: pkg.id,
        payType: 'jsapi',
      })
      const { success, data } = res
      success && onBridgeReady(data)
    }
    return
  }

  /* 其他场景打开支付窗口 */
  useGlobalStore.updateOrderInfo({ pkgInfo: pkg })
}

async function openDrawerAfter() {
  // 首先检查登录状态
  if (!checkLoginStatus()) {
    return
  }

  loading.value = true
  try {
    // 清空当前套餐列表，避免显示旧数据
    packageList.value = []
    // 获取用户最新余额信息
    await authStore.getUserInfo()
    // 获取套餐列表
    const res: ResData = await fetchGetPackageAPI({ status: 1, size: 30 })
    packageList.value = res.data.rows
    // 获取签到记录
    await getSigninLog()
    await fetchModelTokenUsage()
    loading.value = false
  } catch (error) {
    loading.value = false
    console.error('加载会员中心数据失败:', error)
  }
}

const selectName = ref('')
const handleSelect = (item: { name: string }) => {
  selectName.value = item.name
  cramiSelect.value = false
}

function handleSuccess(pkg: Pkg) {
  // 检查支付渠道是否启用
  if (!payChannel.value.length) {
    ms.warning(t('goods.paymentNotEnabled'))
    return
  }

  // 微信移动端环境需要特殊处理
  if (
    isWxEnv.value &&
    payPlatform.value === 'wechat' &&
    Number(authStore.globalConfig.payWechatStatus) === 1
  ) {
    // 直接处理JSAPI支付
    handleBuyGoods(pkg)
    return
  }

  // 其他情况切换到支付视图
  showPaymentView(pkg)
}

function splitDescription(description: string) {
  return description.split('\n')
}

const code = ref('')
const cramiSelect = ref(false)
async function useCrami() {
  if (!code.value.trim()) {
    ms.info(t('usercenter.pleaseEnterCardDetails'))
    return
  }

  try {
    loading.value = true
    await fetchUseCramiAPI({ code: code.value })
    ms.success(t('usercenter.cardRedeemSuccess'))
    authStore.getUserInfo()
    loading.value = false
    // 清空卡密输入框
    code.value = ''
  } catch (error: any) {
    loading.value = false
    // 清空卡密输入框
    code.value = ''
  }
}

// 由于globalConfig可能没有showCrami属性，这里默认为true显示卡密兑换
const showCrami = ref(true)

const router = useRouter()
const showGoodsDialog = ref(false)

const openGoodsDialog = () => {
  showGoodsDialog.value = true
}

// 签到相关状态和方法
const signInData = ref<{ signInDate: string; isSigned: boolean }[]>([])
const signInLoading = ref(false)
const today = new Date().toISOString().split('T')[0]

const days = computed(() => {
  return signInData.value.map(item => ({
    ...item,
    day: item.signInDate.split('-').pop()?.replace(/^0/, ''),
    isToday: item.signInDate === today,
  }))
})

const consecutiveDays = computed(() => authStore.userInfo.consecutiveDays || 0)
const signInModel3Count = computed(() => Number(authStore.globalConfig?.signInModel3Count) || 0)
const signInModel4Count = computed(() => Number(authStore.globalConfig?.signInModel4Count) || 0)
const signInMjDrawToken = computed(() => Number(authStore.globalConfig?.signInMjDrawToken) || 0)

const hasSignedInToday = computed(() => {
  return signInData.value.some(item => item.signInDate === today && item.isSigned)
})

async function getSigninLog() {
  try {
    const res: ResData = await fetchSignLogAPI()
    if (res.success) {
      signInData.value = res.data || []
    }
  } catch (error) {
    console.error('加载签到数据失败:', error)
  }
}

async function handleSignIn() {
  try {
    signInLoading.value = true
    const res: ResData = await fetchSignInAPI()
    if (res.success) {
      ms.success('签到成功！')
      await getSigninLog()
      authStore.getUserInfo()
    }
    signInLoading.value = false
  } catch (error) {
    signInLoading.value = false
    console.error('签到失败:', error)
  }
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

// 获取用户信息和余额
const userBalance = computed(() => authStore.userBalance)
const isMember = computed(() => userBalance.value.isMember || false)

const totalConsumedPoints = computed(() => {
  const ub = authStore.userBalance as Record<string, unknown>
  return (
    (Number(ub?.useModel3Count) || 0) +
    (Number(ub?.useModel4Count) || 0) +
    (Number(ub?.useDrawMjCount) || 0)
  )
})

const consumedBreakdownText = computed(() => {
  const ub = authStore.userBalance as Record<string, unknown>
  return t('usercenter.consumedPointsBreakdown', {
    m3: Number(ub?.useModel3Count) || 0,
    m4: Number(ub?.useModel4Count) || 0,
    mj: Number(ub?.useDrawMjCount) || 0,
  })
})

/** 账户维度累计 Tokens（与扣费时写入 user_balances 的用量一致） */
const totalAccountTokens = computed(() => {
  const ub = authStore.userBalance as Record<string, unknown>
  return (
    (Number(ub?.useModel3Token) || 0) +
    (Number(ub?.useModel4Token) || 0) +
    (Number(ub?.useDrawMjToken) || 0)
  )
})

const accountTokensBreakdownText = computed(() => {
  const ub = authStore.userBalance as Record<string, unknown>
  return t('usercenter.balanceTokenBreakdown', {
    m3: Number(ub?.useModel3Token) || 0,
    m4: Number(ub?.useModel4Token) || 0,
    mj: Number(ub?.useDrawMjToken) || 0,
  })
})

interface ModelTokenRow {
  model: string
  modelName: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  replyCount: number
  estimateAmount?: number | null
  estimateCurrency?: string | null
}

const modelTokenRows = ref<ModelTokenRow[]>([])
const modelTokenLoading = ref(false)
const estimateTotalsByCurrency = ref<Record<string, number>>({})
const estimateDisclaimer = ref('')

function formatEstimateMoney(
  currency: string | null | undefined,
  amount: number | null | undefined
) {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const sym = currency === 'USD' ? '$' : '¥'
  const n = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  return `${sym}${n}`
}

const estimateTotalsDisplay = computed(() => {
  const o = estimateTotalsByCurrency.value
  const keys = Object.keys(o).filter(k => (o[k] || 0) > 0)
  if (!keys.length) return ''
  return keys.map(k => formatEstimateMoney(k, o[k])).join(' + ')
})

async function fetchModelTokenUsage() {
  modelTokenLoading.value = true
  try {
    const res = (await fetchGetModelTokenUsageAPI()) as ResData<{
      rows?: ModelTokenRow[]
      estimateTotalsByCurrency?: Record<string, number>
      estimateDisclaimer?: string
    }>
    if (!res?.success || !res.data) {
      modelTokenRows.value = []
      estimateTotalsByCurrency.value = {}
      estimateDisclaimer.value = ''
      return
    }
    modelTokenRows.value = res.data.rows ?? []
    estimateTotalsByCurrency.value = res.data.estimateTotalsByCurrency ?? {}
    estimateDisclaimer.value = res.data.estimateDisclaimer ?? ''
  } catch {
    modelTokenRows.value = []
    estimateTotalsByCurrency.value = {}
    estimateDisclaimer.value = ''
    ms.error(t('usercenter.modelTokenLoadFail'))
  } finally {
    modelTokenLoading.value = false
  }
}

interface ConsumptionRow {
  id: number
  createdAt?: string
  consumedAmount?: number
  consumedDeductType?: number
  extent?: string
  consumedTokens?: number | null
}

const showConsumptionModal = ref(false)
const consumptionRows = ref<ConsumptionRow[]>([])
const consumptionCount = ref(0)
const consumptionPage = ref(1)
const consumptionLoading = ref(false)

const consumptionHasMore = computed(() => consumptionRows.value.length < consumptionCount.value)

async function fetchConsumptionPage(page: number, append: boolean) {
  consumptionLoading.value = true
  try {
    const res = (await fetchGetConsumptionLogAPI({
      page,
      size: 30,
    })) as ResData<{ rows?: ConsumptionRow[]; count?: number }>
    if (!res?.success || !res.data) {
      ms.error(t('usercenter.consumptionLoadFail'))
      return
    }
    const rows = res.data.rows ?? []
    consumptionCount.value = Number(res.data.count) || 0
    if (append) consumptionRows.value = [...consumptionRows.value, ...rows]
    else consumptionRows.value = rows
    consumptionPage.value = page
  } catch {
    ms.error(t('usercenter.consumptionLoadFail'))
  } finally {
    consumptionLoading.value = false
  }
}

async function openConsumptionModal() {
  showConsumptionModal.value = true
  consumptionPage.value = 1
  await fetchConsumptionPage(1, false)
}

async function loadMoreConsumption() {
  if (!consumptionHasMore.value || consumptionLoading.value) return
  await fetchConsumptionPage(consumptionPage.value + 1, true)
}

function consumptionPointsTypeLabel(deductType: number | undefined): string {
  if (deductType === 1) return model3Name.value
  if (deductType === 2) return model4Name.value
  if (deductType === 3) return drawMjName.value
  return t('usercenter.points')
}

function consumptionSceneLabel(extentRaw: string | undefined): string {
  if (!extentRaw?.trim()) return t('usercenter.sceneUnknown')
  try {
    const o = JSON.parse(extentRaw) as { scene?: string }
    if (o.scene === 'chat') return t('usercenter.sceneChat')
    if (o.scene === 'tts') return t('usercenter.sceneTts')
    if (o.scene === 'mj_chat') return t('usercenter.sceneMjChat')
    if (o.scene === 'drawing_mj') return t('usercenter.sceneDrawingMj')
  } catch {
    /* ignore */
  }
  return t('usercenter.sceneUnknown')
}

function consumptionDetailLine(extentRaw: string | undefined): string {
  if (!extentRaw?.trim()) return '—'
  try {
    const o = JSON.parse(extentRaw) as {
      modelName?: string
      model?: string
      tokenBased?: boolean
    }
    const parts: string[] = []
    if (o.modelName) parts.push(String(o.modelName))
    else if (o.model) parts.push(String(o.model))
    if (o.tokenBased === true) parts.push(t('usercenter.consumptionTokenBasedHint'))
    return parts.length ? parts.join(' · ') : '—'
  } catch {
    return extentRaw.length > 160 ? `${extentRaw.slice(0, 160)}…` : extentRaw
  }
}

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 登录检测函数
function checkLoginStatus() {
  console.log('会员中心 - 检查登录状态:', isLogin.value)
  if (!isLogin.value) {
    console.log('用户未登录，关闭设置弹窗并打开登录弹窗')
    // 显示消息提醒
    ms.warning('请先登录后使用会员中心')
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

// 监听登录状态变化
watch(isLogin, newLoginStatus => {
  console.log('会员中心 - 登录状态变化:', newLoginStatus)
  // 如果组件可见但用户登出了，立即关闭设置弹窗并打开登录弹窗
  if (props.visible && !newLoginStatus) {
    console.log('用户已登出，关闭设置弹窗并打开登录弹窗')
    // 显示消息提醒
    ms.warning('账户已登出，请重新登录后查看')
    useGlobalStore.updateSettingsDialog(false)
    authStore.setLoginDialog(true)
  }
})

// 添加对visible属性的监听，确保组件可见时重新加载数据
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 组件显示时立即检查登录状态
      if (checkLoginStatus()) {
        openDrawerAfter()
        if (isWxEnv.value) jsapiInitConfig()
      }
    }
  }
)
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 主视图 -->
    <div v-if="activeView === 'main'">
      <!-- 套餐列表卡片 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4 flex flex-col space-y-4"
      >
        <!-- 卡片标题 -->
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          套餐列表
        </div>

        <!-- 套餐列表 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="(item, index) in packageList"
            :key="index"
            :class="[
              item.name == selectName
                ? 'ring-2 ring-primary-500 shadow-md'
                : 'ring-1 ring-gray-200 dark:ring-gray-700',
              'rounded-lg p-6 hover:shadow-md bg-white dark:bg-gray-750',
            ]"
            @click="handleSelect(item)"
          >
            <div class="relative">
              <b class="text-lg font-semibold leading-8 dark:text-white">{{ item.name }}</b>
            </div>

            <div v-if="!isHideModel3Point" class="flex justify-between items-end mt-4">
              <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{
                model3Name
              }}</span>
              <span class="font-bold dark:text-white">
                {{ item.model3Count > 99999 ? '无限额度' : item.model3Count }}
              </span>
            </div>

            <div v-if="!isHideModel4Point" class="flex justify-between items-end mt-2">
              <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{
                model4Name
              }}</span>
              <span class="font-bold dark:text-white">
                {{ item.model4Count > 99999 ? '无限额度' : item.model4Count }}
              </span>
            </div>

            <div v-if="!isHideDrawMjPoint" class="flex justify-between items-end mt-2">
              <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{
                drawMjName
              }}</span>
              <span class="font-bold dark:text-white">
                {{ item.drawMjCount > 99999 ? '无限额度' : item.drawMjCount }}
              </span>
            </div>

            <div class="mt-4 flex items-baseline gap-x-1">
              <span class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{{
                `￥${item.price}`
              }}</span>
            </div>

            <div class="mt-6">
              <button @click.stop="handleSuccess(item)" class="btn btn-primary btn-md w-full">
                购买套餐
              </button>
            </div>

            <ul
              v-if="item.des"
              class="mt-4 space-y-2 text-sm leading-6 text-gray-600 dark:text-gray-400"
            >
              <li
                v-for="(line, index) in splitDescription(item.des)"
                :key="index"
                class="flex gap-x-2"
              >
                <svg
                  class="h-5 w-5 flex-none text-primary-600 dark:text-primary-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clip-rule="evenodd"
                  />
                </svg>
                {{ line }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <!-- 签到和余额并排显示区域 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <!-- 签到日历卡片 - 左侧 -->
        <div
          class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col space-y-4 h-full"
        >
          <!-- 卡片标题 -->
          <div
            class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
          >
            签到奖励
          </div>

          <!-- 签到信息 -->
          <div
            class="bg-gray-50 mb-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-700"
          >
            <span class="dark:text-gray-300">签到赠送：</span>
            <span v-if="signInModel3Count > 0 && !isHideModel3Point"
              ><b class="mx-2 text-primary-500">{{ signInModel3Count }}</b
              ><span class="dark:text-gray-300">{{ model3Name }}</span></span
            >
            <span v-if="signInModel4Count > 0 && !isHideModel4Point"
              ><b class="mx-2 text-primary-500">{{ signInModel4Count }}</b
              ><span class="dark:text-gray-300">{{ model4Name }}</span></span
            >
            <span v-if="signInMjDrawToken > 0 && !isHideDrawMjPoint"
              ><b class="mx-2 text-primary-500">{{ signInMjDrawToken }}</b
              ><span class="dark:text-gray-300">{{ drawMjName }}</span></span
            >
            <span class="dark:text-gray-300"
              >（已连续签到<b class="text-red-500 mx-1">{{ consecutiveDays }}</b
              >天）</span
            >
          </div>

          <!-- 签到日历 -->
          <div class="flex-grow">
            <div
              class="grid grid-cols-7 text-center text-xs leading-6 text-gray-500 dark:text-gray-400"
            >
              <div>日</div>
              <div>一</div>
              <div>二</div>
              <div>三</div>
              <div>四</div>
              <div>五</div>
              <div>六</div>
            </div>
            <div class="mt-2 grid grid-cols-7 text-sm">
              <div
                v-for="n in getFirstDayOfMonth(new Date().getFullYear(), new Date().getMonth())"
                :key="'empty-' + n"
                class="py-2"
              ></div>
              <div v-for="day in days" :key="day.signInDate" class="py-2">
                <button
                  type="button"
                  :class="[
                    day.isToday
                      ? 'bg-primary-600 text-white'
                      : day.isSigned
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-900 dark:text-gray-100',
                    'hover:bg-gray-200 dark:hover:bg-gray-700 mx-auto flex h-8 w-8 items-center justify-center rounded-full',
                  ]"
                >
                  <time :datetime="day.signInDate">{{ day.day }}</time>
                </button>
              </div>
            </div>
          </div>

          <!-- 签到按钮 -->
          <div class="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              @click="handleSignIn"
              :disabled="hasSignedInToday || signInLoading"
              class="btn btn-primary btn-md w-full"
            >
              <span v-if="signInLoading">签到中...</span>
              <span v-else-if="hasSignedInToday">已签到</span>
              <span v-else>签到</span>
            </button>
          </div>
        </div>

        <!-- 钱包余额卡片 - 右侧 -->
        <div
          class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col space-y-4 h-full"
        >
          <!-- 卡片标题 -->
          <div
            class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
          >
            额度信息
          </div>

          <!-- 余额信息 -->
          <div class="space-y-3">
            <!-- 基础模型积分 -->
            <div
              v-if="!isHideModel3Point"
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">{{ model3Name }}</div>
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{
                  userBalance.sumModel3Count > 999999
                    ? '无限额度'
                    : (userBalance.sumModel3Count ?? 0)
                }}
                <span
                  v-if="userBalance.sumModel3Count <= 999999"
                  class="text-sm text-gray-500 dark:text-gray-400 ml-1"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 高级模型积分 -->
            <div
              v-if="!isHideModel4Point"
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">{{ model4Name }}</div>
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{
                  userBalance.sumModel4Count > 99999
                    ? '无限额度'
                    : (userBalance.sumModel4Count ?? 0)
                }}
                <span
                  v-if="userBalance.sumModel4Count <= 99999"
                  class="text-sm text-gray-500 dark:text-gray-400 ml-1"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 绘画积分 -->
            <div
              v-if="!isHideDrawMjPoint"
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">{{ drawMjName }}</div>
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {{
                  userBalance.sumDrawMjCount > 99999
                    ? '无限额度'
                    : (userBalance.sumDrawMjCount ?? 0)
                }}
                <span
                  v-if="userBalance.sumDrawMjCount <= 99999"
                  class="text-sm text-gray-500 dark:text-gray-400 ml-1"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 累计已消耗积分 -->
            <div
              class="flex flex-col gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/80 dark:bg-gray-800/40"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="text-gray-500 dark:text-gray-400 shrink-0">
                  {{ t('usercenter.totalConsumedPoints') }}
                </div>
                <div class="text-lg font-bold text-amber-700 dark:text-amber-400 text-right">
                  {{ totalConsumedPoints }}
                  <span class="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">{{
                    t('usercenter.points')
                  }}</span>
                </div>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                {{ consumedBreakdownText }}
              </p>
              <p class="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
                {{ t('usercenter.creditsNotCashHint') }}
              </p>
              <button
                type="button"
                class="btn btn-outline btn-sm border-primary/40 text-primary-600 dark:text-primary-400"
                @click="openConsumptionModal"
              >
                {{ t('usercenter.consumptionDetailTitle') }}
              </button>
            </div>

            <!-- 账户累计 Tokens（与扣费写入 user_balances 一致） -->
            <div
              class="flex flex-col gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/80 dark:bg-gray-800/40"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="text-gray-500 dark:text-gray-400 shrink-0">
                  {{ t('usercenter.balanceTokenTotalLabel') }}
                </div>
                <div
                  class="text-lg font-bold text-sky-700 dark:text-sky-400 text-right tabular-nums"
                >
                  {{ totalAccountTokens.toLocaleString() }}
                </div>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                {{ accountTokensBreakdownText }}
              </p>
            </div>

            <!-- 会员到期时间 -->
            <div
              class="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div class="text-gray-500 dark:text-gray-400 w-28">会员状态</div>
              <div
                class="text-lg font-bold"
                :class="isMember ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'"
              >
                {{ userBalance.expirationTime ? `${userBalance.expirationTime} 到期` : '非会员' }}
              </div>
            </div>
          </div>

          <!-- 卡密兑换部分移至此处 -->
          <div
            v-if="showCrami"
            class="flex-grow mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
          >
            <div class="text-base font-medium text-gray-900 dark:text-gray-100 mb-3">卡密兑换</div>
            <div class="flex items-center space-x-2">
              <input
                v-model="code"
                :placeholder="t('usercenter.enterCardDetails')"
                class="input input-md w-full"
                type="text"
              />
              <button
                :disabled="loading || !code"
                @click="useCrami"
                class="btn btn-primary btn-md w-24"
              >
                兑换
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 各模型 Token：全宽表格 -->
      <div
        class="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
      >
        <div
          class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          {{ t('usercenter.modelTokenUsageTitle') }}
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 leading-snug">
          {{ t('usercenter.modelTokenUsageHint') }}
        </p>
        <p
          v-if="estimateDisclaimer"
          class="text-xs text-amber-700 dark:text-amber-300/90 leading-snug mt-1"
        >
          {{ estimateDisclaimer }}
        </p>
        <p
          v-if="estimateTotalsDisplay"
          class="text-sm font-medium text-gray-800 dark:text-gray-100 mt-2"
        >
          {{ t('usercenter.modelTokenEstimateTotal') }}：{{ estimateTotalsDisplay }}
        </p>
        <div v-if="modelTokenLoading" class="flex justify-center py-10">
          <span class="loading loading-spinner loading-md text-primary" />
        </div>
        <div
          v-else-if="!modelTokenRows.length"
          class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          {{ t('usercenter.modelTokenEmpty') }}
        </div>
        <div
          v-else
          class="mt-3 max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-600"
        >
          <table
            class="table table-zebra table-sm w-full min-w-[640px] text-left text-xs sm:text-sm"
          >
            <thead class="sticky top-0 z-[1] bg-base-200/90 dark:bg-gray-800/95">
              <tr class="text-gray-600 dark:text-gray-300">
                <th>{{ t('usercenter.modelTokenColName') }}</th>
                <th>{{ t('usercenter.modelTokenColId') }}</th>
                <th class="text-right">{{ t('usercenter.modelTokenColTotal') }}</th>
                <th class="text-right">{{ t('usercenter.modelTokenColIn') }}</th>
                <th class="text-right">{{ t('usercenter.modelTokenColOut') }}</th>
                <th class="text-right">{{ t('usercenter.modelTokenColReplies') }}</th>
                <th class="text-right">{{ t('usercenter.modelTokenColEstimate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in modelTokenRows" :key="`${row.model}-${idx}`">
                <td class="max-w-[10rem] truncate" :title="row.modelName">{{ row.modelName }}</td>
                <td
                  class="font-mono text-[11px] text-gray-600 dark:text-gray-400 max-w-[8rem] truncate"
                  :title="row.model"
                >
                  {{ row.model }}
                </td>
                <td class="text-right tabular-nums font-medium">
                  {{ row.totalTokens.toLocaleString() }}
                </td>
                <td class="text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {{ row.promptTokens.toLocaleString() }}
                </td>
                <td class="text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {{ row.completionTokens.toLocaleString() }}
                </td>
                <td class="text-right tabular-nums">{{ row.replyCount.toLocaleString() }}</td>
                <td class="text-right tabular-nums text-xs">
                  {{
                    row.estimateAmount != null && row.estimateCurrency
                      ? formatEstimateMoney(row.estimateCurrency, row.estimateAmount)
                      : '—'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 支付视图 -->
    <MemberPayment
      v-else-if="activeView === 'payment'"
      :visible="activeView === 'payment'"
      @back-to-main="backToMainView"
      @payment-success="handlePaymentSuccess"
    />

    <Teleport to="body">
      <div
        v-if="showConsumptionModal"
        class="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        @click.self="showConsumptionModal = false"
      >
        <div
          class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-800"
          @click.stop
        >
          <div
            class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-600"
          >
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
              {{ t('usercenter.consumptionDetailTitle') }}
            </h3>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-circle"
              :aria-label="t('usercenter.consumptionClose')"
              @click="showConsumptionModal = false"
            >
              ✕
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
            <div
              v-if="consumptionLoading && consumptionRows.length === 0"
              class="flex justify-center py-16"
            >
              <span class="loading loading-spinner loading-md text-primary" />
            </div>
            <div
              v-else-if="!consumptionLoading && consumptionRows.length === 0"
              class="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
            >
              {{ t('usercenter.consumptionEmpty') }}
            </div>
            <table v-else class="table table-zebra table-sm w-full text-left text-xs sm:text-sm">
              <thead>
                <tr class="text-gray-600 dark:text-gray-300">
                  <th>{{ t('usercenter.consumptionTime') }}</th>
                  <th>{{ t('usercenter.consumptionPointsType') }}</th>
                  <th>{{ t('usercenter.consumptionAmount') }}</th>
                  <th>{{ t('usercenter.consumptionTokens') }}</th>
                  <th>{{ t('usercenter.consumptionReason') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in consumptionRows" :key="row.id">
                  <td class="whitespace-nowrap">{{ row.createdAt || '—' }}</td>
                  <td>{{ consumptionPointsTypeLabel(row.consumedDeductType) }}</td>
                  <td class="font-semibold text-amber-700 dark:text-amber-400">
                    {{ row.consumedAmount ?? '—' }}
                  </td>
                  <td class="tabular-nums text-gray-700 dark:text-gray-200">
                    <template v-if="row.consumedTokens != null && row.consumedTokens > 0">
                      {{ Number(row.consumedTokens).toLocaleString() }}
                    </template>
                    <template v-else>—</template>
                  </td>
                  <td>
                    <div class="font-medium text-gray-800 dark:text-gray-200">
                      {{ consumptionSceneLabel(row.extent) }}
                    </div>
                    <div class="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                      {{ consumptionDetailLine(row.extent) }}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            class="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-600"
          >
            <button
              type="button"
              class="btn btn-outline btn-sm"
              @click="showConsumptionModal = false"
            >
              {{ t('usercenter.consumptionClose') }}
            </button>
            <button
              v-if="consumptionHasMore"
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="consumptionLoading"
              @click="loadMoreConsumption"
            >
              <span
                v-if="consumptionLoading"
                class="loading loading-spinner loading-xs mr-1 align-middle"
              />
              {{ t('usercenter.consumptionLoadMore') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}
</style>
