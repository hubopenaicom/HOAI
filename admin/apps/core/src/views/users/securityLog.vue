<script lang="ts" setup>
  import ApiUser from '@/api/modules/user';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import type { FormInstance } from 'element-plus';
  import { onMounted, reactive, ref } from 'vue';

  const ACTION_OPTIONS = [
    { label: '全部动作', value: '' },
    { label: '首次绑定邮箱', value: 'EMAIL_BIND' },
    { label: '换绑邮箱', value: 'EMAIL_REBIND' },
  ];

  const formRef = ref<FormInstance>();
  const total = ref(0);
  const loading = ref(false);
  const userList = ref<{ id: number; username: string }[]>([]);

  const formInline = reactive({
    userId: '' as number | '' | string,
    action: '',
    page: 1,
    size: 15,
  });

  interface SecurityLogRow {
    id: number;
    createdAt: string;
    userId: number;
    action: string;
    meta: string | null;
    ip: string | null;
  }

  const tableData = ref<SecurityLogRow[]>([]);

  function formatMeta(meta: string | null | undefined): string {
    if (meta == null || meta === '') return '—';
    try {
      return JSON.stringify(JSON.parse(meta), null, 2);
    } catch {
      return meta;
    }
  }

  async function queryLogs() {
    try {
      loading.value = true;
      const res = await ApiUser.querySecurityLogs({
        page: formInline.page,
        size: formInline.size,
        userId: formInline.userId === '' ? undefined : formInline.userId,
        action: formInline.action || undefined,
      });
      const { rows, count } = res.data;
      total.value = count;
      tableData.value = rows;
    } catch {
      // 错误由全局拦截器提示
    } finally {
      loading.value = false;
    }
  }

  async function handlerSearchUser(val: string) {
    const res = await ApiUser.queryAllUser({ size: 30, keyword: val });
    userList.value = res.data.rows;
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    formInline.page = 1;
    formInline.userId = '';
    formInline.action = '';
    queryLogs();
  }

  onMounted(() => queryLogs());
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">安全审计日志</div>
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
              placeholder="昵称|手机|邮箱"
              remote-show-suffix
              :remote-method="handlerSearchUser"
              style="width: 220px"
            >
              <el-option
                v-for="item in userList"
                :key="item.id"
                :label="item.username"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="动作" prop="action">
            <el-select v-model="formInline.action" placeholder="全部" clearable style="width: 180px">
              <el-option
                v-for="item in ACTION_OPTIONS"
                :key="item.value || 'all'"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="queryLogs">
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
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="createdAt" label="时间" width="190" align="center">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD hh:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户ID" width="100" />
        <el-table-column prop="action" label="动作" width="140" />
        <el-table-column prop="ip" label="IP" width="160" show-overflow-tooltip />
        <el-table-column prop="meta" label="详情(JSON)" min-width="320">
          <template #default="scope">
            <pre class="m-0 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{{
              formatMeta(scope.row.meta)
            }}</pre>
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[15, 30, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryLogs"
          @current-change="queryLogs"
        />
      </el-row>
    </page-main>
  </div>
</template>
