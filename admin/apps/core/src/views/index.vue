<script lang="ts" setup>
  import apiDashboard from '@/api/modules/dashboard';
  import * as echarts from 'echarts';
  // import { ElNotification } from 'element-plus';
  import { ChatDotRound, Picture, ShoppingCart, TrendCharts, User } from '@element-plus/icons-vue';
  import { marked } from 'marked';
  import ResizeObserver from 'resize-observer-polyfill';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  // 导入CHANGELOG.md文件内容
  import changelogMd from '@/assets/CHANGELOG.md?raw';

  defineOptions({ name: 'home' })

  /** HOAI 产品版本（与上游开源基线版本号区分） */
  const HOAI_PRODUCT_VERSION = '1.0.0'
  /** 业务代码所基于的开源项目及基线版本，与 service/package.json 中历史版本对齐 */
  const HOAI_UPSTREAM_BASE_LABEL = '99AI 4.3.0'

  const appSettingsStore = useAppSettingsStore();

  const colorScheme = computed(() => {
    return appSettingsStore.settings.theme.colorScheme;
  });

  const { pkg } = __SYSTEM_INFO__;

  // 处理更新日志内容
  const changelogHtml = computed(() => {
    return marked(changelogMd);
  });

  const baseInfo = ref({
    userCount: 0,
    newUserCount: 0,
    chatCount: 0,
    newChatCount: 0,
    drawCount: 0,
    newDrawCount: 0,
    orderCount: 0,
    newOrderCount: 0,
  });
  interface ApiDashboard {
    getBaseInfo: () => Promise<any>;
    getBaiduVisit: (params: any) => Promise<any>;
    getChatStatistic: (params: any) => Promise<any>;
    getObserverCharts: (params: any) => Promise<any>;
  }

  let charCharts: echarts.ECharts | undefined;
  let baiduCharts: echarts.ECharts | undefined;
  let observer: ResizeObserver;
  const chatDays = ref(30);
  const baiduDays = ref(30);
  const activeTab = ref('chat');

  const chatChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['对话数量', '绘画数量'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: true,
        data: [],
        axisLabel: {
          rotate: 32,
          interval: 'auto',
          hideOverlap: true,
          fontSize: 11,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: ['#ffffff1a'],
            width: 1,
            type: 'solid',
          },
        },
      },
    ],
    yAxis: [
      {
        type: 'value',
        splitLine: {
          show: true,
          lineStyle: {
            width: 1,
            color: ['#ffffff1a'],
            type: 'solid',
          },
        },
      },
    ],
    series: [
      {
        name: '对话数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
      {
        name: '绘画数量',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)',
        },
        emphasis: {
          focus: 'series',
        },
        data: [],
      },
    ],
  };

  const baiduVisitChartsOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: '10px',
      data: ['pv', 'uv', 'ip'],
    },
    grid: {
      top: '50px',
      left: '3%',
      right: '3%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: [],
      axisLabel: {
        rotate: 32,
        interval: 'auto',
        hideOverlap: true,
        fontSize: 11,
      },
      splitLine: {
        show: true,
        lineStyle: {
          // 分隔线样式
          color: ['#ffffff1a'],
          width: 1,
          type: 'solid',
        },
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        show: true,
        lineStyle: {
          width: 1,
          color: ['#ffffff1a'],
          type: 'solid',
        },
      },
    },
    series: [
      {
        name: 'pv',
        type: 'bar',
        itemStyle: {
          color: 'rgba(17, 76, 255, 0.8)',
        },
        data: [],
      },
      {
        name: 'uv',
        type: 'bar',
        itemStyle: {
          color: 'rgba(0, 215, 255, 0.8)',
        },
        data: [],
      },
      {
        name: 'ip',
        type: 'bar',
        itemStyle: {
          color: 'rgba(255, 193, 7, 0.8)',
        },
        data: [],
      },
    ],
  };

  const daysList = [
    {
      label: 7,
      value: '最近七天',
    },
    {
      label: 15,
      value: '最近半月',
    },
    {
      label: 30,
      value: '最近一月',
    },
    {
      label: 90,
      value: '最近三月',
    },
  ];

  async function getBaseInfo() {
    const res = await apiDashboard.getBaseInfo();
    console.log(res.data);
    baseInfo.value = res.data;
  }

  async function getBaiduVisitInfo() {
    const res = await apiDashboard.getBaiduVisit({ days: baiduDays.value });

    const { data } = res;
    baiduVisitChartsOption.xAxis.data = data.items[0].map((t: Array<{}>) => t[0]);
    baiduVisitChartsOption.series.forEach((item, index) => {
      item.data = data.items[1].map((t: Array<{}>) => t[index]);
    });

    await nextTick();
    const chartDom = document.getElementById('baidu') as HTMLElement;
    if (baiduCharts) {
      baiduCharts.dispose();
    }
    baiduCharts = echarts.init(chartDom);
    baiduCharts.setOption(baiduVisitChartsOption);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        baiduCharts?.resize();
      });
    });
  }

  async function getChatStatisticInfo() {
    const res = await apiDashboard.getChatStatistic({ days: chatDays.value });
    const { date, chat, draw } = res.data;
    chatChartsOption.xAxis[0].data = date;
    chatChartsOption.series[0].data = chat;
    chatChartsOption.series[1].data = draw;

    await nextTick();
    const chartDom = document.getElementById('chat') as HTMLElement;
    if (charCharts) {
      charCharts.dispose();
    }
    charCharts = echarts.init(chartDom);
    charCharts.setOption(chatChartsOption);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        charCharts?.resize();
      });
    });
  }

  watch(colorScheme, () => {
    changeColorScheme();
  });

  function changeColorScheme() {
    const scheme = appSettingsStore.currentColorScheme;
    const lineColor = scheme === 'dark' ? ['#ffffff1a'] : ['#0000001a'];
    chatChartsOption.yAxis[0].splitLine.lineStyle.color = lineColor;
    chatChartsOption.xAxis[0].splitLine.lineStyle.color = lineColor;
    charCharts && charCharts.setOption(chatChartsOption);
    baiduVisitChartsOption.yAxis.splitLine.lineStyle.color = lineColor;
    baiduVisitChartsOption.xAxis.splitLine.lineStyle.color = lineColor;
    baiduCharts && baiduCharts.setOption(baiduVisitChartsOption);
  }

  function handleTabChange(tabName: string | number) {
    activeTab.value = tabName as string;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (tabName === 'chat') {
          charCharts?.resize();
        }
        else if (tabName === 'visitor') {
          baiduCharts?.resize();
        }
      });
    });
  }

  onMounted(async () => {
    await getBaseInfo();
    await Promise.all([getChatStatisticInfo(), getBaiduVisitInfo()]);
    changeColorScheme();
    // 添加通知
    // const h = document.createElement.bind(document);
    // ElNotification({
    //   title: '配置迁移提醒',
    //   message:
    //     '除对话页外的其他页面将不再维护。专业绘画、思维导图等页面的配置已移至其他设置中。',
    //   type: 'info',
    //   duration: 15000,
    // });
  });

  onMounted(() => {
    observer = new ResizeObserver(() => {
      charCharts && charCharts.resize();
      baiduCharts && baiduCharts.resize();
    });
    const chatElm = document.getElementById('chat');
    chatElm && observer?.observe(chatElm);
    const baiduElm = document.getElementById('baidu');
    baiduElm && observer?.observe(baiduElm);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    charCharts?.dispose();
    charCharts = undefined;
    baiduCharts?.dispose();
    baiduCharts = undefined;
  });
</script>

<template>
  <div class="bg-background flex min-h-[calc(100dvh-6rem)] flex-col overflow-hidden p-4 md:p-6">
    <!-- 主要内容区域：min-h-0 便于子项 flex-1；小屏纵向堆叠 -->
    <div class="flex min-h-0 flex-1 flex-col gap-5 xl:flex-row">
      <!-- 左侧：说明 + 框架链接 -->
      <div class="flex min-w-0 flex-1 flex-col gap-4">
        <!-- 更新日志 -->
        <div
          class="flex flex-[4] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm"
        >
          <div
            class="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-4"
          >
            <span class="text-base font-semibold text-foreground">关于 HOAI 控制台</span>
            <span
              class="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
              >HOAI v{{ HOAI_PRODUCT_VERSION }}</span
            >
          </div>
          <div
            class="border-b border-border bg-muted/30 px-5 py-3 text-xs leading-relaxed text-muted-foreground"
          >
            <p class="mb-1.5 text-foreground/90">
              当前部署的 <span class="font-medium text-foreground">HOAI</span>（HubOpenAI）产品版本为
              <span class="font-mono font-medium text-foreground">{{ HOAI_PRODUCT_VERSION }}</span>。
            </p>
            <p>
              管理后台与配套服务端在开源项目
              <span class="font-medium text-foreground">{{ HOAI_UPSTREAM_BASE_LABEL }}</span>
              代码基线上持续迭代与定制开发；下方更新日志为 HOAI 侧维护记录。管理端界面基于 Fantastic-admin（构建元数据版本
              <span class="font-mono">{{ pkg.version }}</span>）。
            </p>
          </div>
          <div
            class="markdown-body hide-h1 flex-1 overflow-x-hidden overflow-y-auto p-5"
            v-html="changelogHtml"
          ></div>
        </div>

        <!-- 站点说明（非外链卡片，避免与首页文档重复） -->
        <div class="flex h-auto min-h-[5rem] shrink-0 justify-start xl:h-20">
          <div
            class="flex h-full w-full flex-col justify-center gap-1 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div class="flex items-center gap-2">
              <FaIcon name="i-mdi:shield-check-outline" class="text-xl text-primary" />
              <span class="text-sm font-medium text-foreground">HOAI · HubOpenAI 运营与配置</span>
            </div>
            <p class="text-xs leading-relaxed text-muted-foreground">
              用户、模型、对话、支付与风控等由当前部署后端提供；HubOpenAI 品牌简称 HOAI，技术栈说明见左侧文档。
            </p>
          </div>
        </div>
      </div>

      <!-- 右侧：统计数据 + 图表 -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 xl:flex-[2]">
        <!-- 统计卡片 -->
        <div class="grid h-55 grid-cols-2 grid-rows-2 gap-4">
          <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-indigo-500 to-purple-600"
            >
              <el-icon><User /></el-icon>
            </div>
            <div class="flex-1">
              <div class="mb-1 text-xs text-muted-foreground">今日新增用户</div>
              <div class="mb-0.5 text-2xl font-bold text-foreground">
                {{ baseInfo?.newUserCount || 0 }}
              </div>
              <div class="text-xs text-muted-foreground">
                总计: {{ baseInfo.userCount || 0 }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-pink-400 to-red-500"
            >
              <el-icon><ChatDotRound /></el-icon>
            </div>
            <div class="flex-1">
              <div class="mb-1 text-xs text-muted-foreground">今日对话</div>
              <div class="mb-0.5 text-2xl font-bold text-foreground">
                {{ baseInfo.newChatCount || 0 }}
              </div>
              <div class="text-xs text-muted-foreground">
                总计: {{ baseInfo.chatCount || 0 }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-blue-400 to-cyan-400"
            >
              <el-icon><Picture /></el-icon>
            </div>
            <div class="flex-1">
              <div class="mb-1 text-xs text-muted-foreground">今日绘画</div>
              <div class="mb-0.5 text-2xl font-bold text-foreground">
                {{ baseInfo.newDrawCount || 0 }}
              </div>
              <div class="text-xs text-muted-foreground">
                总计: {{ baseInfo.drawCount || 0 }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white bg-gradient-to-br from-green-400 to-teal-400"
            >
              <el-icon><ShoppingCart /></el-icon>
            </div>
            <div class="flex-1">
              <div class="mb-1 text-xs text-muted-foreground">今日订单</div>
              <div class="mb-0.5 text-2xl font-bold text-foreground">
                {{ baseInfo.newOrderCount || 0 }}
              </div>
              <div class="text-xs text-muted-foreground">
                总计: {{ baseInfo.orderCount || 0 }}
              </div>
            </div>
          </div>
        </div>

        <!-- 图表区域 -->
        <div
          class="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:min-h-[480px]"
        >
          <div
            class="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-4"
          >
            <el-tabs v-model="activeTab" @tab-change="handleTabChange">
              <el-tab-pane label="对话统计" name="chat">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><ChatDotRound /></el-icon>
                    <span>对话统计</span>
                  </div>
                </template>
              </el-tab-pane>
              <el-tab-pane label="访客统计" name="visitor">
                <template #label>
                  <div class="flex items-center justify-center gap-2 px-2">
                    <el-icon><TrendCharts /></el-icon>
                    <span>访客统计</span>
                  </div>
                </template>
              </el-tab-pane>
            </el-tabs>

            <el-radio-group
              v-if="activeTab === 'chat'"
              v-model="chatDays"
              @change="getChatStatisticInfo"
              size="small"
            >
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>

            <el-radio-group v-else v-model="baiduDays" @change="getBaiduVisitInfo" size="small">
              <el-radio-button v-for="item in daysList" :key="item.value" :label="item.label">
                {{ item.value }}
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="relative min-h-[360px] flex-1 p-5">
            <div
              id="chat"
              class="h-[360px] w-full sm:h-[400px]"
              v-show="activeTab === 'chat'"
            />
            <div
              id="baidu"
              class="h-[360px] w-full sm:h-[400px]"
              v-show="activeTab === 'visitor'"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /* Tab样式优化 - 移除Tab之间的间距 */
  :deep(.el-tabs__nav) {
    gap: 0 !important;
  }

  :deep(.el-tabs__item) {
    margin-right: 0 !important;
    padding: 0 !important;
  }

  /* Markdown样式 */
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    word-wrap: break-word;
  }

  /* 隐藏顶级标题 */
  :deep(.hide-h1 h1:first-child) {
    display: none;
  }

  :deep(.markdown-body h1) {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 12px;
    margin-top: 16px;
  }

  :deep(.markdown-body h2) {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
    margin-top: 16px;
    padding-bottom: 4px;
    border-bottom: 1px solid oklch(var(--border));
  }

  :deep(.markdown-body h3) {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
    margin-top: 12px;
  }

  :deep(.markdown-body ul) {
    list-style-type: disc;
    padding-left: 16px;
    margin-bottom: 12px;
  }

  :deep(.markdown-body p) {
    margin-bottom: 12px;
  }

  :deep(.markdown-body code) {
    background: oklch(var(--muted) / 0.45);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  :deep(.markdown-body pre) {
    background: oklch(var(--muted) / 0.35);
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow-x: auto;
  }

  :deep(.markdown-body a) {
    color: oklch(var(--primary));
    text-decoration: none;
  }

  :deep(.markdown-body a:hover) {
    text-decoration: underline;
  }

  :deep(.markdown-body) {
    color: oklch(var(--foreground));
  }
</style>
