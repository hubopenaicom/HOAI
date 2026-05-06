<script lang="ts" setup>
  import ApiModels from '@/api/modules/models';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance, FormRules } from 'element-plus';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { onMounted, onUnmounted, reactive, ref } from 'vue';

  const SOURCE_LABEL: Record<string, string> = {
    manual: '手工维护',
    openrouter: 'OpenRouter',
    litellm: 'LiteLLM',
    merged: '合并解析',
  };

  const formRef = ref<FormInstance>();
  const formCatalogRef = ref<FormInstance>();
  const loading = ref(false);
  const syncLoading = ref(false);
  const syncDialogVisible = ref(false);
  const syncPollTimer = ref<ReturnType<typeof setInterval> | null>(null);
  const syncJob = reactive({
    syncId: '',
    status: '' as string,
    phase: '',
    percent: 0,
    processed: 0,
    total: 0,
    message: '' as string,
    resultText: '' as string,
  });
  const total = ref(0);
  const tableData = ref<any[]>([]);
  const dialogVisible = ref(false);
  const editId = ref(0);

  const formInline = reactive({
    page: 1,
    size: 15,
    modelId: '',
    source: '',
  });

  const formCatalog = reactive({
    modelId: '',
    displayName: '',
    maxModelTokens: 128000,
    max_tokens: 16384,
    locked: true,
    remark: '',
  });

  const syncForm = reactive({
    scope: 'both' as 'both' | 'openrouter' | 'litellm',
    force: false,
  });

  const rules = reactive<FormRules>({
    modelId: [{ required: true, message: '请填写模型 ID', trigger: 'blur' }],
    maxModelTokens: [{ required: true, message: '请填写上下文 Tokens', trigger: 'blur' }],
    max_tokens: [{ required: true, message: '请填写回复 Tokens', trigger: 'blur' }],
  });

  const dialogTitle = () => (editId.value ? '编辑 Token 限额' : '新增 Token 限额');

  async function queryList() {
    try {
      loading.value = true;
      const res: any = await ApiModels.queryTokenCatalog({ ...formInline });
      const { rows, count } = res.data;
      total.value = count;
      tableData.value = rows;
    } finally {
      loading.value = false;
    }
  }

  function resetSearch(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    formInline.page = 1;
    queryList();
  }

  function openCreate() {
    editId.value = 0;
    Object.assign(formCatalog, {
      modelId: '',
      displayName: '',
      maxModelTokens: 128000,
      max_tokens: 16384,
      locked: true,
      remark: '',
    });
    dialogVisible.value = true;
  }

  function openEdit(row: any) {
    editId.value = row.id;
    Object.assign(formCatalog, {
      modelId: row.modelId,
      displayName: row.displayName || '',
      maxModelTokens: row.maxModelTokens,
      max_tokens: row.max_tokens,
      locked: Boolean(row.locked),
      remark: row.remark || '',
    });
    dialogVisible.value = true;
  }

  async function submitCatalog(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (!valid) return;
      const payload: any = {
        modelId: formCatalog.modelId.trim(),
        displayName: formCatalog.displayName || undefined,
        maxModelTokens: Number(formCatalog.maxModelTokens),
        max_tokens: Number(formCatalog.max_tokens),
        locked: formCatalog.locked,
        remark: formCatalog.remark || undefined,
        source: 'manual',
      };
      if (editId.value) {
        payload.id = editId.value;
      }
      await ApiModels.setTokenCatalog(payload);
      ElMessage.success(editId.value ? '更新成功' : '新增成功');
      dialogVisible.value = false;
      queryList();
    });
  }

  async function handleDelete(row: any) {
    await ElMessageBox.confirm(`确定删除模型「${row.modelId}」的限额记录吗？`, '确认删除', {
      type: 'warning',
    });
    await ApiModels.delTokenCatalog({ id: row.id });
    ElMessage.success('已删除');
    queryList();
  }

  function stopSyncPoll() {
    if (syncPollTimer.value) {
      clearInterval(syncPollTimer.value);
      syncPollTimer.value = null;
    }
  }

  async function pollSyncOnce(syncId: string) {
    const res: any = await ApiModels.syncTokenCatalogProgress({ syncId });
    const j = res.data;
    syncJob.status = j.status;
    syncJob.phase = j.phase || '';
    syncJob.percent = Math.min(100, Math.max(0, Number(j.percent) || 0));
    syncJob.processed = j.processed ?? 0;
    syncJob.total = j.total ?? 0;
    syncJob.message = j.message || '';

    if (j.status === 'done' && j.result) {
      const r = j.result;
      syncJob.resultText = `新增 ${r.inserted}，更新 ${r.updated}，跳过 ${r.skipped}（OpenRouter ${r.openRouterModels} 条 / LiteLLM 对话键 ${r.liteLLmChatKeys} 个，候选 ${r.totalCandidates}）`;
      stopSyncPoll();
      syncLoading.value = false;
      ElMessage.success('同步完成');
      queryList();
    } else if (j.status === 'error') {
      stopSyncPoll();
      syncLoading.value = false;
      ElMessage.error(syncJob.message || '同步失败');
    }
  }

  async function runSync() {
    try {
      await ElMessageBox.confirm(
        syncForm.force
          ? '将强制更新包含「锁定」在内的所有匹配记录，是否继续？'
          : '将跳过已锁定的手工维护项；新增或更新其它模型。是否继续？',
        '同步 OpenRouter / LiteLLM',
        { type: 'warning' },
      );
    } catch {
      return;
    }
    stopSyncPoll();
    syncJob.syncId = '';
    syncJob.status = '';
    syncJob.phase = '';
    syncJob.percent = 0;
    syncJob.processed = 0;
    syncJob.total = 0;
    syncJob.message = '';
    syncJob.resultText = '';
    syncDialogVisible.value = true;

    try {
      syncLoading.value = true;
      const res: any = await ApiModels.syncTokenCatalog({
        scope: syncForm.scope,
        force: syncForm.force,
      });
      const syncId = res.data?.syncId;
      if (!syncId) {
        throw new Error('未返回 syncId');
      }
      syncJob.syncId = syncId;
      await pollSyncOnce(syncId);
      if (syncJob.status !== 'done' && syncJob.status !== 'error') {
        syncPollTimer.value = setInterval(() => {
          void pollSyncOnce(syncId);
        }, 600);
      }
    } catch {
      syncLoading.value = false;
      syncDialogVisible.value = false;
    }
  }

  onMounted(() => {
    queryList();
  });

  onUnmounted(() => {
    stopSyncPoll();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <span>模型 Token 限额维护</span>
      </template>
      <template #content>
        <div class="text-sm text-gray-600 leading-relaxed max-w-3xl">
          <p>
            维护「模型 ID → 上下文 Tokens / 回复 Tokens」对照表，供「模型设置」里选择账号关联模型后一键填入。
          </p>
          <p>
            <strong>手工</strong>记录默认<strong>锁定</strong>，批量同步时不会覆盖；取消锁定后会参与同步更新。
            来源为 OpenRouter / LiteLLM / 合并解析 的行由同步任务写入。
          </p>
        </div>
      </template>
      <HButton type="primary" @click="openCreate">
        <FaIcon name="i-mdi:plus" class="size-4" />
        新增
      </HButton>
    </PageHeader>

    <page-main>
      <div class="fa-admin-toolbar mb-4 flex flex-wrap items-end gap-3">
        <el-form ref="formRef" :inline="true" :model="formInline">
          <el-form-item label="模型 ID">
            <el-input
              v-model="formInline.modelId"
              placeholder="模糊搜索"
              clearable
              style="width: 200px"
              @keyup.enter="queryList"
            />
          </el-form-item>
          <el-form-item label="来源">
            <el-select v-model="formInline.source" clearable placeholder="全部" style="width: 140px">
              <el-option label="手工维护" value="manual" />
              <el-option label="OpenRouter" value="openrouter" />
              <el-option label="LiteLLM" value="litellm" />
              <el-option label="合并解析" value="merged" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryList">查询</el-button>
            <el-button @click="resetSearch(formRef)">重置</el-button>
          </el-form-item>
        </el-form>

        <div class="flex flex-wrap items-center gap-2 ml-auto">
          <el-select v-model="syncForm.scope" style="width: 140px">
            <el-option label="全部来源" value="both" />
            <el-option label="仅 OpenRouter" value="openrouter" />
            <el-option label="仅 LiteLLM" value="litellm" />
          </el-select>
          <el-checkbox v-model="syncForm.force">强制覆盖锁定项</el-checkbox>
          <el-button type="success" :loading="syncLoading" @click="runSync">同步目录</el-button>
        </div>
      </div>

      <el-dialog
        v-model="syncDialogVisible"
        title="同步目录进度"
        width="480px"
        :close-on-click-modal="false"
        @closed="stopSyncPoll()"
      >
        <div class="space-y-3 text-sm">
          <div v-if="syncJob.syncId" class="text-gray-500">任务 ID：{{ syncJob.syncId }}</div>
          <div>{{ syncJob.phase || '准备中…' }}</div>
          <el-progress :percentage="syncJob.percent" :stroke-width="16" />
          <div v-if="syncJob.total > 0">
            已处理 {{ syncJob.processed }} / {{ syncJob.total }} 条
          </div>
          <el-alert v-if="syncJob.message && syncJob.status === 'error'" type="error" :title="syncJob.message" show-icon />
          <el-alert v-if="syncJob.resultText && syncJob.status === 'done'" type="success" :title="syncJob.resultText" show-icon />
        </div>
        <template #footer>
          <el-button
            :disabled="syncLoading && syncJob.status !== 'done' && syncJob.status !== 'error'"
            @click="syncDialogVisible = false"
          >
            关闭
          </el-button>
        </template>
      </el-dialog>

      <el-table v-loading="loading" border :data="tableData" size="large">
        <el-table-column prop="modelId" label="模型 ID" min-width="220" show-overflow-tooltip />
        <el-table-column prop="displayName" label="名称" width="180" show-overflow-tooltip />
        <el-table-column prop="maxModelTokens" label="上下文 Tokens" width="130" align="center" />
        <el-table-column prop="max_tokens" label="回复 Tokens" width="120" align="center" />
        <el-table-column label="来源" width="120" align="center">
          <template #default="{ row }">
            <el-tag
              :type="
                row.source === 'manual'
                  ? 'warning'
                  : row.source === 'merged'
                    ? 'success'
                    : 'info'
              "
            >
              {{ SOURCE_LABEL[row.source] || row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="locked" label="锁定" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.locked ? 'danger' : 'success'">{{ row.locked ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="120" align="center">
          <template #default="{ row }">
            {{ utcToShanghaiTime(row.updatedAt, 'YYYY-MM-DD HH:mm') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-popconfirm title="确认删除？" @confirm="handleDelete(row)">
              <template #reference>
                <el-button link type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          :page-sizes="[10, 15, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryList"
          @current-change="queryList"
        />
      </el-row>
    </page-main>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle()"
      width="560px"
      destroy-on-close
      @closed="formCatalogRef?.resetFields()"
    >
      <el-form
        ref="formCatalogRef"
        label-width="130px"
        :model="formCatalog"
        :rules="rules"
      >
        <el-form-item label="模型 ID" prop="modelId">
          <el-input v-model="formCatalog.modelId" placeholder="与「账号关联模型」一致，如 openai/gpt-4o" />
        </el-form-item>
        <el-form-item label="展示名称" prop="displayName">
          <el-input v-model="formCatalog.displayName" placeholder="可选" />
        </el-form-item>
        <el-form-item label="上下文 Tokens" prop="maxModelTokens">
          <el-input-number v-model="formCatalog.maxModelTokens" :min="1" :max="10000000" :step="1000" class="w-full" />
        </el-form-item>
        <el-form-item label="回复 Tokens" prop="max_tokens">
          <el-input-number v-model="formCatalog.max_tokens" :min="1" :max="1000000" :step="256" class="w-full" />
        </el-form-item>
        <el-form-item label="同步时锁定" prop="locked">
          <el-switch v-model="formCatalog.locked" />
          <span class="text-xs text-gray-500 ml-2">锁定后批量同步不会覆盖本条</span>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="formCatalog.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCatalog(formCatalogRef)">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
