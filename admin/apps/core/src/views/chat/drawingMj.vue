<script lang="ts" setup>
  import ApiDrawingMj from '@/api/modules/drawingMj';
  import ApiUser from '@/api/modules/user';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance } from 'element-plus';
  import { computed, onMounted, reactive, ref } from 'vue';

  interface MjJobRow {
    id: number;
    userId: number;
    username?: string;
    nickname?: string;
    email?: string;
    clientKey?: number;
    taskId?: string;
    modelKey: string;
    mjMode: string;
    mjStyleSnapshot?: string;
    promptLabel: string;
    loading: boolean;
    error?: string;
    task?: Record<string, unknown>;
    imageUrls?: string[];
    createdAt?: string;
    updatedAt?: string;
  }

  const loading = ref(false);
  const userList = ref<any[]>([]);
  const formRef = ref<FormInstance>();
  const total = ref(0);
  const tableData = ref<MjJobRow[]>([]);
  const detailsVisible = ref(false);
  const current = ref<MjJobRow | null>(null);

  const formInline = reactive({
    userId: '' as string | number,
    keyword: '',
    modelKey: '',
    taskId: '',
    loading: '' as string,
    page: 1,
    size: 10,
  });

  const previewList = computed(() => {
    const u = current.value?.imageUrls;
    return Array.isArray(u) ? u : [];
  });

  function formatJson(obj: unknown): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  function showDetails(row: MjJobRow) {
    current.value = row;
    detailsVisible.value = true;
  }

  async function queryList(): Promise<void> {
    loading.value = true;
    try {
      const params: Record<string, unknown> = {
        page: formInline.page,
        size: formInline.size,
      };
      if (formInline.userId !== '' && formInline.userId != null) {
        params.userId = formInline.userId;
      }
      if (formInline.keyword.trim()) params.keyword = formInline.keyword.trim();
      if (formInline.modelKey.trim()) params.modelKey = formInline.modelKey.trim();
      if (formInline.taskId.trim()) params.taskId = formInline.taskId.trim();
      if (formInline.loading === '1' || formInline.loading === '0') {
        params.loading = formInline.loading;
      }
      const res = await ApiDrawingMj.adminQueryJobs(params);
      const { rows, count } = res.data;
      total.value = count;
      tableData.value = rows;
    } catch {
      /* axios 已提示 */
    } finally {
      loading.value = false;
    }
  }

  async function handlerSearchUser(val: string): Promise<void> {
    const res = await ApiUser.queryAllUser({ size: 30, username: val });
    userList.value = res.data.rows;
  }

  function handlerReset(formEl: FormInstance | undefined): void {
    formEl?.resetFields();
    formInline.page = 1;
    formInline.size = 10;
    formInline.userId = '';
    formInline.keyword = '';
    formInline.modelKey = '';
    formInline.taskId = '';
    formInline.loading = '';
    queryList();
  }

  onMounted(() => {
    queryList();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">绘画管理（Midjourney）</div>
      </template>
    </PageHeader>
    <page-main>
      <div class="fa-admin-toolbar">
        <el-form ref="formRef" :inline="true" :model="formInline">
          <el-form-item label="用户" prop="userId">
            <el-select
              v-model="formInline.userId"
              filterable
              clearable
              remote
              reserve-keyword
              placeholder="用户名模糊搜索"
              remote-show-suffix
              :remote-method="handlerSearchUser"
              style="width: 180px"
            >
              <el-option
                v-for="item in userList"
                :key="item.id"
                :label="item.username"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="关键词" prop="keyword">
            <el-input
              v-model="formInline.keyword"
              placeholder="提示词 / 上游任务 ID"
              style="width: 200px"
              clearable
              @keydown.enter.prevent="queryList"
            />
          </el-form-item>
          <el-form-item label="模型" prop="modelKey">
            <el-input
              v-model="formInline.modelKey"
              placeholder="模型 key"
              style="width: 160px"
              clearable
              @keydown.enter.prevent="queryList"
            />
          </el-form-item>
          <el-form-item label="任务 ID" prop="taskId">
            <el-input
              v-model="formInline.taskId"
              placeholder="精确 taskId"
              style="width: 180px"
              clearable
              @keydown.enter.prevent="queryList"
            />
          </el-form-item>
          <el-form-item label="状态" prop="loading">
            <el-select v-model="formInline.loading" placeholder="全部" style="width: 120px" clearable>
              <el-option label="进行中" value="1" />
              <el-option label="已结束" value="0" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryList">
              <span class="inline-flex items-center gap-1">
                <FaIcon name="i-mdi:magnify" class="size-4" />
                查询
              </span>
            </el-button>
            <el-button @click="handlerReset(formRef)">
              <span class="inline-flex items-center gap-1">
                <FaIcon name="i-mdi:backup-restore" class="size-4" />
                重置
              </span>
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </page-main>

    <page-main style="width: 100%">
      <el-table v-loading="loading" border :data="tableData" style="width: 100%" size="large">
        <el-table-column label="预览" width="100" align="center">
          <template #default="scope">
            <el-image
              v-if="scope.row.imageUrls?.length"
              :src="scope.row.imageUrls[0]"
              :preview-src-list="scope.row.imageUrls"
              fit="cover"
              class="h-14 w-14 rounded"
              preview-teleported
            />
            <span v-else class="text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column label="用户" width="170" fixed>
          <template #default="scope">
            <div>{{ scope.row.username }}</div>
            <div v-if="scope.row.nickname" class="text-xs text-gray-500">
              {{ scope.row.nickname }}
            </div>
            <div class="text-xs text-gray-400">ID {{ scope.row.userId }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="promptLabel" label="提示 / 摘要" min-width="260" show-overflow-tooltip />
        <el-table-column prop="modelKey" label="模型" width="140" show-overflow-tooltip />
        <el-table-column label="模式" width="100">
          <template #default="scope">
            <span>{{ scope.row.mjMode }}</span>
            <span v-if="scope.row.mjStyleSnapshot" class="text-xs text-gray-500">
              / {{ scope.row.mjStyleSnapshot }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="taskId" label="上游任务 ID" width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.loading ? 'warning' : 'success'" size="small">
              {{ scope.row.loading ? '进行中' : '已结束' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="175">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="scope">
            <el-button type="primary" link @click="showDetails(scope.row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="detailsVisible" title="绘画任务详情" width="72%" destroy-on-close>
        <div v-if="current" class="p-1">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="用户">
              {{ current.username }}
              <span v-if="current.nickname">（{{ current.nickname }}）</span>
            </el-descriptions-item>
            <el-descriptions-item label="用户 ID">{{ current.userId }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ current.email }}</el-descriptions-item>
            <el-descriptions-item label="记录 ID">{{ current.id }}</el-descriptions-item>
            <el-descriptions-item label="客户端键">{{ current.clientKey ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="上游任务 ID">{{ current.taskId || '—' }}</el-descriptions-item>
            <el-descriptions-item label="模型">{{ current.modelKey }}</el-descriptions-item>
            <el-descriptions-item label="MJ 模式">{{ current.mjMode }}</el-descriptions-item>
            <el-descriptions-item label="风格快照">{{
              current.mjStyleSnapshot || '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              {{ current.loading ? '进行中' : '已结束' }}
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{
              current.createdAt
                ? utcToShanghaiTime(current.createdAt, 'YYYY-MM-DD hh:mm:ss')
                : '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{
              current.updatedAt
                ? utcToShanghaiTime(current.updatedAt, 'YYYY-MM-DD hh:mm:ss')
                : '—'
            }}</el-descriptions-item>
            <el-descriptions-item label="失败原因" :span="2" v-if="current.error">
              {{ current.error }}
            </el-descriptions-item>
            <el-descriptions-item label="提示 / 摘要" :span="2">
              {{ current.promptLabel }}
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="previewList.length" class="mt-4">
            <div class="mb-2 font-medium">产出图片</div>
            <div class="flex flex-wrap gap-2">
              <el-image
                v-for="(u, i) in previewList"
                :key="i"
                :src="u"
                :preview-src-list="previewList"
                :initial-index="i"
                fit="contain"
                class="h-32 w-32 rounded border border-gray-200"
                preview-teleported
              />
            </div>
          </div>

          <el-tabs class="mt-4">
            <el-tab-pane label="上游任务 JSON">
              <pre class="json-block">{{ formatJson(current.task) }}</pre>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-dialog>

      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryList"
          @current-change="queryList"
        />
      </el-row>
    </page-main>
  </div>
</template>

<style scoped>
  .json-block {
    max-height: 420px;
    overflow: auto;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
