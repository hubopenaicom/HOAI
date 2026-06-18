<script lang="ts" setup>
  import ApiModels from '@/api/modules/models';
  import uploadApi from '@/api/modules/upload';
  import { utcToShanghaiTime } from '@/utils/utcFormatTime';
  import { Plus, QuestionFilled, Refresh } from '@element-plus/icons-vue';
  import type {
    FormInstance,
    FormRules,
    UploadProps,
    UploadRequestHandler,
    UploadRequestOptions,
  } from 'element-plus';
  import { ElMessage } from 'element-plus';
  import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

  import {
    DEDUCTTYPELIST,
    MODEL_LIST,
    MODELSMAPLIST,
    MODELTYPELIST,
    MODELTYPEMAP,
    // ModelTypeLabelMap,
    QUESTION_STATUS_OPTIONS,
  } from '@/constants/index';
  import axios from 'axios';

  const formRef = ref<FormInstance>();
  const total = ref(0);
  const visible = ref(false);
  const loading = ref(false);
  const modelLoading = ref(false);

  const formInline = reactive({
    keyType: '',
    model: '',
    page: 1,
    size: 10,
    status: null,
  });

  const status = computed({
    get: () => formInline.status ?? undefined,
    set: (val) => {
      formInline.status = val ?? null;
    },
  });

  const formPackageRef = ref<FormInstance>();
  const activeModelKeyId = ref(0);
  const formPackage = reactive({
    keyType: 1,
    modelName: '',
    key: '',
    modelAvatar: '',
    status: true,
    model: '',
    isTokenBased: false,
    tokenFeeRatio: 1000,
    modelOrder: 0,
    maxModelTokens: 64000,
    max_tokens: 4096,
    proxyUrl: '',
    timeout: 300,
    deduct: 1,
    deductType: 1,
    maxRounds: 12,
    isFileUpload: 0,
    isImageUpload: 0,
    modelLimits: 50,
    modelDescription: '',
    isNetworkSearch: false,
    deepThinkingType: 0,
    deductDeepThink: 1,
    isMcpTool: false,
    systemPrompt: '',
    systemPromptType: 0,
    drawingType: 0,
    estimateTokenCostEnabled: false,
    estimateTokenCurrency: 'CNY',
    estimateTokenInputPerMillion: 0,
    estimateTokenOutputPerMillion: 0,
    deductMjRelax: null as number | null,
    deductMjFast: null as number | null,
    deductMjTurbo: null as number | null,
  });

  /**
   * 规范化API基础URL
   * @param baseUrl - 需要规范化的API基础URL
   * @returns 规范化后的URL字符串
   */
  const correctApiBaseUrl = (baseUrl: string): string => {
    if (!baseUrl) return '';

    // 去除两端空格
    let url = baseUrl.trim();

    // 如果URL以斜杠'/'结尾，则移除这个斜杠
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // 检查URL是否已包含任何版本标记，包括常见的模式如/v1, /v1beta, /v1alpha等
    if (!/\/v\d+(?:beta|alpha)?/.test(url)) {
      // 如果不包含任何版本号，添加 /v1
      return `${url}/v1`;
    }

    return url;
  };

  // Computed property for actual proxy URL
  const actualProxyUrl = computed(() => correctApiBaseUrl(formPackage.proxyUrl));

  const rules = reactive<FormRules>({
    keyType: [{ required: true, message: '请选择调用模型类型', trigger: 'blur' }],
    modelName: [{ required: true, message: '请填写您的模型名称', trigger: 'blur' }],
    key: [{ required: false, message: '请填写您的调用模型key', trigger: 'blur' }],
    // secret: [
    //   { required: true, message: '请填写您的调用模型的secret', trigger: 'blur' },
    // ],
    status: [{ required: true, message: '请选择key的显示状态', trigger: 'change' }],
    // isDraw: [
    //   {
    //     required: true,
    //     message: '请选择当前key是否作为基础绘画key',
    //     trigger: 'change',
    //   },
    // ],
    isFileUpload: [
      {
        required: false,
        message: '请选择当前模型是否开启文件解析及支持种类',
        trigger: 'change',
      },
    ],
    isImageUpload: [
      {
        required: false,
        message: '请选择当前模型是否开启图片解析及支持种类',
        trigger: 'change',
      },
    ],
    isTokenBased: [
      {
        required: true,
        message: '请选择当前key是否基于token计费',
        trigger: 'change',
      },
    ],
    tokenFeeRatio: [{ required: false, message: 'token计费比例', trigger: 'change' }],
    model: [
      {
        required: true,
        message: '请选择当前key需要绑定的模型',
        trigger: 'change',
      },
    ],
    modelOrder: [{ required: true, message: '请填写当前模型排序', trigger: 'blur' }],

    // keyWeight: [
    //   { required: true, message: '请填写key的权重值', trigger: 'blur' },
    // ],
    maxModelTokens: [{ required: true, message: '请填写模型最大token数', trigger: 'blur' }],
    max_tokens: [{ required: true, message: '请填写模型最大回复token数', trigger: 'blur' }],
    proxyUrl: [{ required: false, message: '请填写指定代理地址', trigger: 'blur' }],
    modelAvatar: [
      {
        required: false,
        message: '请填写AI模型使用的头像, 不填写使用系统默认',
        trigger: 'blur',
      },
    ],
    timeout: [
      {
        required: true,
        message: '请填写超时时间 默认 60 单位（秒）',
        trigger: 'blur',
      },
    ],
    deductType: [{ required: true, message: '请选择当前模型扣费类型', trigger: 'change' }],
    deduct: [
      {
        required: true,
        message: '请填写当前模型扣费金额（需要是正整数）',
        trigger: 'blur',
      },
    ],
    maxRounds: [
      {
        required: true,
        message: '请填写允许用户选择的最大上下文轮次',
        trigger: 'blur',
      },
    ],
    modelLimits: [
      {
        required: true,
        message: '请填写模型调用频率限制',
        trigger: 'blur',
      },
    ],
    modelDescription: [
      {
        required: false,
        message: '请填写模型描述',
        trigger: 'blur',
      },
    ],
    isNetworkSearch: [
      {
        required: false,
        message: '请填写是否开启网络搜索',
        trigger: 'change',
      },
    ],
    deepThinkingType: [
      {
        required: false,
        message: '请选择深度思考模式',
        trigger: 'change',
      },
    ],
    deductDeepThink: [
      {
        required: false,
        message: '请填写深度思考积分系数',
        trigger: 'blur',
      },
    ],
  });

  function handlerCloseDialog(formEl: FormInstance | undefined) {
    activeModelKeyId.value = 0;
    formEl?.resetFields();
  }

  const modelList = computed(
    () => MODELSMAPLIST[formPackage.keyType as keyof typeof MODELSMAPLIST],
  );

  const dialogTitle = computed(() => {
    return activeModelKeyId.value ? '修改模型' : '新增模型';
  });

  // const labelKeyName = computed(() => ModelTypeLabelMap[formPackage.keyType]);

  const dialogButton = computed(() => {
    return activeModelKeyId.value ? '确认更新' : '确认新增';
  });

  /** 创意模型 + 绘画类型为 Midjourney */
  const isMjDrawingKey = computed(
    () => [2].includes(Number(formPackage.keyType)) && Number(formPackage.drawingType) === 3,
  );

  const tableData = ref([]);

  async function queryModelsList() {
    try {
      loading.value = true;
      const res = await ApiModels.queryModels({
        ...formInline,
        status: status.value,
      });
      loading.value = false;
      const { rows, count } = res.data;
      total.value = count;
      tableData.value = rows;
    } catch (error) {
      loading.value = false;
    }
  }

  async function handleDeleteKey(row: any) {
    const { id } = row;
    await ApiModels.delModels({ id });
    ElMessage({ type: 'success', message: '操作完成！' });
    queryModelsList();
  }

  function handleEditKey(row: any) {
    activeModelKeyId.value = row.id;
    const {
      keyType,
      modelName,
      key,
      status,
      model,
      modelOrder,
      maxModelTokens,
      max_tokens,
      proxyUrl,
      timeout,
      deductType,
      deduct,
      maxRounds,
      modelAvatar,
      isTokenBased,
      tokenFeeRatio,
      isFileUpload,
      isImageUpload,
      modelLimits,
      modelDescription,
      isNetworkSearch,
      deepThinkingType,
      deductDeepThink,
      isMcpTool,
      systemPrompt,
      systemPromptType,
      drawingType,
      deductMjRelax,
      deductMjFast,
      deductMjTurbo,
      estimateTokenCostEnabled,
      estimateTokenCurrency,
      estimateTokenInputPerMillion,
      estimateTokenOutputPerMillion,
    } = row;
    nextTick(() => {
      Object.assign(formPackage, {
        keyType,
        modelName,
        key,
        status: Boolean(status),
        model,
        modelOrder,
        maxModelTokens,
        max_tokens,
        proxyUrl,
        timeout,
        deductType,
        deduct,
        maxRounds,
        modelAvatar,
        isTokenBased: Boolean(isTokenBased),
        tokenFeeRatio,
        isFileUpload,
        isImageUpload,
        modelLimits,
        modelDescription,
        isNetworkSearch: Boolean(isNetworkSearch),
        deepThinkingType: Number(deepThinkingType) || 0,
        deductDeepThink,
        isMcpTool: Boolean(isMcpTool),
        systemPrompt,
        systemPromptType,
        drawingType: Number(drawingType) || 0,
        deductMjRelax: deductMjRelax != null ? Number(deductMjRelax) : null,
        deductMjFast: deductMjFast != null ? Number(deductMjFast) : null,
        deductMjTurbo: deductMjTurbo != null ? Number(deductMjTurbo) : null,
        estimateTokenCostEnabled: Boolean(
          estimateTokenCostEnabled ?? row.estimate_token_cost_enabled,
        ),
        estimateTokenCurrency: String(estimateTokenCurrency || row.estimate_token_currency || 'CNY')
          .toUpperCase()
          .includes('USD')
          ? 'USD'
          : 'CNY',
        estimateTokenInputPerMillion: Number(estimateTokenInputPerMillion ?? row.estimate_token_input_per_million) || 0,
        estimateTokenOutputPerMillion:
          Number(estimateTokenOutputPerMillion ?? row.estimate_token_output_per_million) || 0,
      });
    });
    visible.value = true;
  }

  function handlerReset(formEl: FormInstance | undefined) {
    formEl?.resetFields();
    queryModelsList();
  }

  const handleAvatarSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
    console.log('response: ', response);
    if (response && response.data) {
      formPackage.modelAvatar = response.data;
    } else {
      ElMessage.error('上传成功但未获取到URL');
    }
  };

  async function reuploadModelAvatar() {
    if (formPackage.modelAvatar) {
      try {
        ElMessage.info('正在重新上传模型头像...');
        const originalValue = formPackage.modelAvatar; // 保存原始值
        const file = await downloadFile(formPackage.modelAvatar);
        uploadFile(file, handleAvatarSuccess, originalValue);
      } catch (error) {
        console.error('下载模型头像文件失败', error);
        ElMessage.error('重新上传模型头像失败，请检查链接是否有效');
      }
    }
  }

  function uploadFile(file: any, successHandler: any, originalValue?: string) {
    const form = new FormData();
    form.append('file', file);

    uploadApi
      .uploadFile(form, 'system/models')
      .then((response) => {
        // 创建模拟的响应对象，与el-upload期望的结构一致
        successHandler({
          data: response.data,
        });

        // 如果是重新上传场景（有原始值），显示成功消息
        if (originalValue) {
          ElMessage.success('重新上传模型头像成功');
        }
      })
      .catch((error) => {
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        // 如果上传失败且有原始值，恢复原始值
        if (originalValue && successHandler === handleAvatarSuccess) {
          formPackage.modelAvatar = originalValue;
        }
      });
  }

  // 自定义上传方法
  const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
    const { file, onSuccess, onError } = options;
    const form = new FormData();
    form.append('file', file);

    return uploadApi
      .uploadFile(form, 'system/models')
      .then((response) => {
        if (onSuccess) {
          // 对于普通上传（而非重新上传）显示上传成功的消息
          ElMessage.success('上传成功');
          onSuccess(response);
        }
        return response;
      })
      .catch((error) => {
        if (onError) {
          onError(error);
        }
        console.error('上传失败', error);
        ElMessage.error('文件上传失败');
        return Promise.reject(error);
      });
  };

  async function downloadFile(url: string) {
    const response = await axios.get(url, { responseType: 'blob' });
    let fileName = 'downloaded_file';

    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const matches = /filename="([^"]+)"/.exec(contentDisposition);
      if (matches != null && matches[1]) {
        fileName = matches[1];
      }
    } else {
      fileName = getFileNameFromUrl(url);
    }

    return new File([response.data], fileName, { type: response.data.type });
  }

  function getFileNameFromUrl(url: string | URL) {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    return pathname.substring(pathname.lastIndexOf('/') + 1);
  }

  async function handlerSubmit(formEl: FormInstance | undefined) {
    formEl?.validate(async (valid) => {
      if (valid) {
        const params: any = JSON.parse(JSON.stringify(formPackage));
        delete params.id;
        activeModelKeyId.value && (params.id = activeModelKeyId.value);
        if (Number(formPackage.keyType) === 1) {
          const key = JSON.parse(JSON.stringify(formPackage.key));
          const formatKeyArr = key.split('\n');
          params.key = formatKeyArr;
        }
        for (const k of ['deductMjRelax', 'deductMjFast', 'deductMjTurbo'] as const) {
          const v = params[k];
          if (v === undefined || v === '') params[k] = null;
        }
        if (!isMjDrawingKey.value) {
          params.deductMjRelax = null;
          params.deductMjFast = null;
          params.deductMjTurbo = null;
        }
        /** 绘画类型表单项仅 keyType=2 可见；1/3 必须把 drawingType 置 0，否则会带着库里旧的 3(MJ) 提交 */
        if (![2].includes(Number(params.keyType))) {
          params.drawingType = 0;
        }
        if (![1].includes(Number(params.keyType))) {
          params.estimateTokenCostEnabled = false;
          params.estimateTokenInputPerMillion = 0;
          params.estimateTokenOutputPerMillion = 0;
          params.estimateTokenCurrency = 'CNY';
        }
        await ApiModels.setModels(params);
        ElMessage({ type: 'success', message: '操作成功！' });
        activeModelKeyId.value = 0;
        visible.value = false;
        queryModelsList();
      }
    });
  }

  function showDevOnlyMessage() {
    ElMessage({ type: 'warning', message: '此功能仅开发版支持！' });
  }

  const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];

    // 获取文件扩展名
    const fileName = rawFile.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));

    if (!allowedTypes.includes(rawFile.type) && !allowedExtensions.includes(fileExtension)) {
      ElMessage.error('当前系统仅支持 PNG、JPEG、GIF、WebP 和 ICO 格式的图片!');
      return false;
    } else if (rawFile.size / 1024 > 3000) {
      ElMessage.error('当前限制文件最大不超过 3000KB!');
      return false;
    }
    return true;
  };

  /** 根据 Token 维护表 / OpenRouter / LiteLLM 填入上下文与回复 Tokens */
  async function fillTokensFromCatalog(modelStr: string | undefined) {
    const m = modelStr?.trim();
    if (!m) {
      ElMessage.warning('请先填写或选择「账号关联模型」');
      return;
    }
    try {
      modelLoading.value = true;
      const res: any = await ApiModels.lookupTokenCatalog({ modelId: m });
      const payload = res.data;
      if (payload?.found && payload.maxModelTokens != null && payload.max_tokens != null) {
        formPackage.maxModelTokens = payload.maxModelTokens;
        formPackage.max_tokens = payload.max_tokens;
        const src = payload.fromCatalog ? '维护表' : `公开源（${payload.source || '—'}）`;
        const hit = payload.matchedModelId as string | undefined;
        const aliasHint = hit && hit !== m ? `，已按「${hit}」匹配` : '';
        ElMessage.success(`已填入 Token 限额（${src}${aliasHint}）`);
      } else {
        ElMessage.info(
          `未找到与「${m}」对应的限额（可填写完整 ID，如 openai/gpt-4o；短名会自动尝试常见厂商前缀与后缀匹配）`,
        );
      }
    } finally {
      modelLoading.value = false;
    }
  }

  let catalogFillTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => formPackage.model,
    (val) => {
      if (!visible.value || !val) return;
      if (![1, 3].includes(Number(formPackage.keyType))) return;
      if (activeModelKeyId.value !== 0) return;
      if (catalogFillTimer) clearTimeout(catalogFillTimer);
      catalogFillTimer = setTimeout(() => fillTokensFromCatalog(String(val)), 500);
    },
  );

  watch(
    () => formPackage.keyType,
    () => {
      if (!visible.value) return;
      if (![2].includes(Number(formPackage.keyType))) {
        formPackage.drawingType = 0;
      }
      if (![1].includes(Number(formPackage.keyType))) {
        formPackage.estimateTokenCostEnabled = false;
        formPackage.estimateTokenInputPerMillion = 0;
        formPackage.estimateTokenOutputPerMillion = 0;
        formPackage.estimateTokenCurrency = 'CNY';
      }
    },
  );

  onMounted(() => {
    queryModelsList();
  });
</script>

<template>
  <div>
    <PageHeader>
      <template #title>
        <div class="flex items-center gap-4">模型配置说明</div>
      </template>
      <template #content>
        <div class="text-sm/6">
          <div>模型分为（基础对话｜创意模型｜特殊模型三类）。</div>
          <div>
            基础对话：用户可以在用户端选择的模型，用于对话、问答、聊天等功能，仅支持 OpenAI Chat
            格式，其他模型需自行使用分发程序适配。
          </div>
          <div>
            创意模型：用户端不展示，包含【Midjourney 绘图】【Dalle 绘图】【SDXL
            绘图】【Suno音乐】，用于插件调用。
          </div>
          <div>
            其中，其中 Midjourney 对接 Midjourney-Proxy-Plus 格式，SDXL、LumaVideo 及 SunoMusic 适配
            <a href="https://platform.openai.com/docs/api-reference" target="_blank">OpenAI 兼容 API</a>
            格式。
          </div>
          <div>特殊模型：用户端不展示，包含【TTS朗读】【GPTs】。</div>
        </div>
      </template>
      <HButton outline type="success" @click="visible = true">
        <FaIcon name="i-mdi:plus" class="size-4" />
        添加模型
      </HButton>
    </PageHeader>
    <page-main>
      <div class="fa-admin-toolbar">
      <el-form ref="formRef" :inline="true" :model="formInline">
        <el-form-item label="模型类型" prop="model">
          <el-select
            v-model="formInline.keyType"
            filterable
            allow-create
            placeholder="请选择或填写绑定的模型"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in MODELTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="使用模型" prop="model">
          <el-select
            v-model="formInline.model"
            filterable
            allow-create
            placeholder="请选择或填写绑定的模型"
            clearable
            style="width: 160px"
          >
            <el-option v-for="item in MODEL_LIST" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="显示状态" prop="status">
          <el-select
            v-model="status"
            placeholder="请选择模型的显示状态"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="item in QUESTION_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="queryModelsList">
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
        <el-table-column prop="keyType" label="模型类型" width="120">
          <template #default="scope">
            <el-tag type="success">
              {{ MODELTYPEMAP[scope.row.keyType as keyof typeof MODELTYPEMAP] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="modelOrder" label="模型排序" width="90" align="center" />
        <el-table-column prop="modelLimits" label="频率限制" width="90" align="center" />
        <el-table-column prop="modelName" label="模型名称" width="180" />
        <el-table-column prop="status" align="center" label="显示状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status ? 'success' : 'danger'">
              {{ scope.row.status ? '显示' : '隐藏' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="key" label="模型KEY" width="460">
          <template #default="scope">
            <div class="w-full overflow-y-scroll whitespace-nowrap">
              {{ scope.row.key }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="model" align="center" label="绑定模型" width="180">
          <template #default="scope">
            <el-tag :type="scope.row.model.includes('gpt-4') ? 'success' : 'info'">
              {{ scope.row.model }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isTokenBased" align="center" label="Token计费" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.isTokenBased ? 'success' : 'danger'">
              {{ scope.row.isTokenBased ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deductType" align="center" label="扣费类型" width="90">
          <template #default="scope">
            <el-tag
              :type="
                scope.row.deductType === 1
                  ? 'success'
                  : scope.row.deductType === 2
                    ? 'warning'
                    : 'info'
              "
            >
              {{
                scope.row.deductType === 1
                  ? '普通积分'
                  : scope.row.deductType === 2
                    ? '高级积分'
                    : '绘画积分'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deduct" align="center" label="单次扣除" width="128">
          <template #default="scope">
            <div v-if="Number(scope.row.drawingType) === 3" class="text-left text-xs leading-snug">
              <div class="font-medium">默认 {{ scope.row.deduct }}</div>
              <div v-if="scope.row.deductMjRelax != null" class="text-gray-600">
                慢 {{ scope.row.deductMjRelax }}
              </div>
              <div v-if="scope.row.deductMjFast != null" class="text-gray-600">
                快 {{ scope.row.deductMjFast }}
              </div>
              <div v-if="scope.row.deductMjTurbo != null" class="text-gray-600">
                极 {{ scope.row.deductMjTurbo }}
              </div>
            </div>
            <el-tag v-else :type="scope.row.deductType === 1 ? 'success' : 'warning'">
              {{ `${scope.row.deduct} 积分` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="useCount" align="center" label="调用次数" width="90" />
        <el-table-column prop="useToken" align="center" label="已使用Token" width="120" />
        <el-table-column prop="maxModelTokens" align="center" label="模型最大上下文" width="140">
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.maxModelTokens || '-' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="max_tokens" align="center" label="模型最大回复" width="140">
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.max_tokens || '-' }}
            </el-button>
          </template>
        </el-table-column>

        <el-table-column prop="proxyUrl" align="center" label="绑定的代理地址" width="140">
          <template #default="scope">
            <el-button type="info" text>
              {{ scope.row.proxyUrl || '-' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" align="center" label="添加时间" width="120">
          <template #default="scope">
            {{ utcToShanghaiTime(scope.row.createdAt, 'YYYY-MM-DD') }}
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="200">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleEditKey(scope.row)">
              <span class="inline-flex items-center gap-1">
                <FaIcon name="i-mdi:pencil-outline" class="size-4" />
                变更
              </span>
            </el-button>
            <el-popconfirm
              title="确认删除此秘钥么?"
              width="180"
              icon-color="red"
              @confirm="handleDeleteKey(scope.row)"
            >
              <template #reference>
                <el-button link type="danger" size="small">
                  <span class="inline-flex items-center gap-1">
                    <FaIcon name="i-mdi:delete-outline" class="size-4" />
                    删除秘钥
                  </span>
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-row class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="formInline.page"
          v-model:page-size="formInline.size"
          class="mr-5"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="queryModelsList"
          @current-change="queryModelsList"
        />
      </el-row>
    </page-main>

    <el-dialog
      v-model="visible"
      :close-on-click-modal="false"
      :title="dialogTitle"
      width="770"
      class="max-h-[90vh] overflow-y-auto rounded-md p-4"
      @close="handlerCloseDialog(formPackageRef)"
    >
      <el-form
        ref="formPackageRef"
        v-loading="modelLoading"
        label-position="right"
        label-width="120px"
        :model="formPackage"
        :rules="rules"
        class="pt-4 sm:pt-5"
      >
        <el-form-item label="模型类型选择" prop="keyType">
          <el-select v-model="formPackage.keyType" placeholder="请选择模型类型" style="width: 100%">
            <el-option
              v-for="item in MODELTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p
            v-if="Number(formPackage.keyType) === 2"
            class="mt-2 text-xs leading-relaxed text-muted-foreground"
          >
            创意模型不会在用户端对话里展示，用于 Midjourney / DALL·E / Suno
            等插件调用；请务必选择「绘画类型」，并与上游 API 一致填写「账号关联模型」。
          </p>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="用户端显示"
          prop="status"
        >
          <el-switch v-model="formPackage.status" />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">关闭将在用户端隐藏此模型、但不会影响后台的调用</div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="模型显示名称" prop="modelName">
          <el-input
            v-model="formPackage.modelName"
            placeholder="请填写模型显示名称（用户端看到的）"
          />
        </el-form-item>
        <el-form-item v-if="[1].includes(Number(formPackage.keyType))" label="模型简介" prop="key">
          <el-input
            v-model="formPackage.modelDescription"
            type="text"
            placeholder="请填写模型简介"
          />
        </el-form-item>
        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="模型图标"
          prop="modelAvatar"
        >
          <el-input
            v-model="formPackage.modelAvatar"
            placeholder="请填写或上传网站模型图标"
            clearable
          >
            <template #append>
              <el-upload
                class="avatar-uploader"
                :http-request="customUpload"
                :show-file-list="false"
                :on-success="handleAvatarSuccess"
                :before-upload="beforeAvatarUpload"
                style="display: flex; align-items: center; justify-content: center"
              >
                <img
                  v-if="formPackage.modelAvatar"
                  :src="formPackage.modelAvatar"
                  style="max-width: 1.5rem; max-height: 1.5rem; margin: 5px 0; object-fit: contain"
                />
                <el-icon v-else style="width: 1rem">
                  <Plus />
                </el-icon>
              </el-upload>
              <el-icon
                v-if="formPackage.modelAvatar"
                @click="reuploadModelAvatar"
                style="margin-left: 35px; width: 1rem"
              >
                <Refresh />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="模型排序" prop="modelOrder">
          <div class="input-with-text">
            <el-input-number
              v-model="formPackage.modelOrder"
              :max="999"
              :min="0"
              :step="10"
              class="input-number"
              style="margin-right: 10px"
            />
            <el-tooltip class="box-item" effect="dark" placement="right">
              <template #content>
                <div style="width: 250px">模型排序，越小越靠前。</div>
              </template>
              <el-icon class="ml-3 cursor-pointer">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </el-form-item>

        <el-form-item label="模型调用频率" prop="modelLimits">
          <div class="input-with-text">
            <el-input-number
              v-model="formPackage.modelLimits"
              :max="999"
              :min="0"
              :step="5"
              class="input-number"
              style="margin-right: 10px"
            />
            <span class="unit-text">次/小时</span>
          </div>
        </el-form-item>

        <template v-if="[1].includes(Number(formPackage.keyType))">
          <el-divider content-position="left">Token 用量金额估算（可选）</el-divider>
          <p class="text-xs text-gray-500 -mt-2 mb-2 max-w-[560px] leading-relaxed">
            按每百万 Token 输入/输出单价估算参考成本，仅用于会员中心等展示，不参与积分扣费。开启后请填写大于 0 的单价（美元或人民币）。
          </p>
          <el-form-item label="启用估算">
            <el-switch v-model="formPackage.estimateTokenCostEnabled" />
          </el-form-item>
          <el-form-item v-if="formPackage.estimateTokenCostEnabled" label="估算币别">
            <el-select v-model="formPackage.estimateTokenCurrency" style="width: 200px">
              <el-option label="人民币 (CNY)" value="CNY" />
              <el-option label="美元 (USD)" value="USD" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="formPackage.estimateTokenCostEnabled" label="输入 $/1M">
            <el-input-number
              v-model="formPackage.estimateTokenInputPerMillion"
              :min="0"
              :precision="6"
              :step="0.01"
              class="input-number"
            />
            <span class="unit-text ml-2">{{ formPackage.estimateTokenCurrency }} / 百万输入 Token</span>
          </el-form-item>
          <el-form-item v-if="formPackage.estimateTokenCostEnabled" label="输出 $/1M">
            <el-input-number
              v-model="formPackage.estimateTokenOutputPerMillion"
              :min="0"
              :precision="6"
              :step="0.01"
              class="input-number"
            />
            <span class="unit-text ml-2">{{ formPackage.estimateTokenCurrency }} / 百万输出 Token</span>
          </el-form-item>
        </template>

        <el-form-item label="指定代理地址" prop="proxyUrl">
          <el-input
            v-model="formPackage.proxyUrl"
            placeholder="例如 https://your-proxy.com，未指定 /v1 等版本时将自动添加 /v1"
          />
          <div v-if="actualProxyUrl" class="text-xs text-gray-400 mt-1">
            实际调用地址：{{ actualProxyUrl }}
          </div>
        </el-form-item>
        <el-form-item label="模型密钥" prop="key">
          <el-input v-model="formPackage.key" type="text" placeholder="请填写模型Key" />
        </el-form-item>

        <el-form-item label="账号关联模型" prop="model">
          <el-select
            v-model="formPackage.model"
            filterable
            clearable
            placeholder="请选用或填写绑定的模型"
            allow-create
          >
            <el-option v-for="item in modelList" :key="item" :label="item" :value="item" />
          </el-select>
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                给定了部分可选的模型列表、你可以可以手动填写您需要调用的模型、请确保填写的模型是当前key支持的类型、否则可能会在调用中出现不可预知错误！
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>
        <el-form-item label="模型扣费类型" prop="deductType">
          <el-select
            v-model="formPackage.deductType"
            filterable
            allow-create
            clearable
            placeholder="请选用模型扣费类型"
          >
            <el-option
              v-for="item in DEDUCTTYPELIST"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <!-- <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                设置当前key的扣费类型、扣除普通积分或是高级积分。
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip> -->
        </el-form-item>

        <el-form-item label="单次扣除金额" prop="deduct">
          <el-input
            v-model.number="formPackage.deduct"
            style="width: 400px"
            placeholder="请填写单次调用此key的扣费金额！"
          />
          <p v-if="isMjDrawingKey" class="mt-1 max-w-[520px] text-xs text-gray-500 leading-relaxed">
            Midjourney：此项为<strong>默认基准</strong>；下方「分速度」留空时，该速度按此处扣费。Imagine
            等仍会按提示词乘以倍数（如 --v 7 / --draft），与独立绘画页一致；倍数数值可在后台「网站显示配置」中的「MJ
            提示词计费倍数」集中修改。
          </p>
        </el-form-item>

        <el-form-item
          v-if="[2].includes(Number(formPackage.keyType))"
          label="绘画类型"
          prop="drawingType"
        >
          <div class="flex items-center">
            <el-radio-group v-model="formPackage.drawingType" class="w-[60%]">
              <div class="radio-row">
                <el-radio :label="0">不是绘画</el-radio>
                <el-radio :label="1">dalle兼容</el-radio>
                <el-radio :label="2">gpt-image-1兼容</el-radio>
              </div>
              <div class="radio-row">
                <el-radio :label="3">midjourney</el-radio>
                <el-radio :label="4">chat正则提取</el-radio>
                <el-radio :label="5">豆包</el-radio>
              </div>
              <div class="radio-row">
                <el-radio :label="6">Suno 音乐</el-radio>
              </div>
            </el-radio-group>
            <el-tooltip class="box-item" effect="dark" placement="right">
              <template #content>
                <div style="width: 250px">
                  选择绘画类型：dalle兼容、gpt-image-1兼容、midjourney、chat正则提取、豆包等不同的绘画模型兼容格式
                </div>
              </template>
              <el-icon class="ml-3 cursor-pointer">
                <QuestionFilled />
              </el-icon>
            </el-tooltip>
          </div>
        </el-form-item>

        <template v-if="isMjDrawingKey">
          <el-divider content-position="left">Midjourney 分速度单次扣除（积分）</el-divider>
          <el-form-item label="慢速 RELAX">
            <el-input-number
              :model-value="formPackage.deductMjRelax ?? undefined"
              class="!w-[280px]"
              :min="0"
              :precision="2"
              controls-position="right"
              placeholder="留空则使用上方默认"
              @update:model-value="
                (v: number | undefined) => {
                  formPackage.deductMjRelax = v === undefined ? null : v;
                }
              "
            />
          </el-form-item>
          <el-form-item label="快速 FAST">
            <el-input-number
              :model-value="formPackage.deductMjFast ?? undefined"
              class="!w-[280px]"
              :min="0"
              :precision="2"
              controls-position="right"
              placeholder="留空则使用上方默认"
              @update:model-value="
                (v: number | undefined) => {
                  formPackage.deductMjFast = v === undefined ? null : v;
                }
              "
            />
          </el-form-item>
          <el-form-item label="极速 TURBO">
            <el-input-number
              :model-value="formPackage.deductMjTurbo ?? undefined"
              class="!w-[280px]"
              :min="0"
              :precision="2"
              controls-position="right"
              placeholder="留空则使用上方默认"
              @update:model-value="
                (v: number | undefined) => {
                  formPackage.deductMjTurbo = v === undefined ? null : v;
                }
              "
            />
          </el-form-item>
        </template>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="深度思考"
          prop="deepThinkingType"
        >
          <el-radio-group v-model="formPackage.deepThinkingType">
            <el-radio :label="0">不开启</el-radio>
            <el-radio :label="1">全局思考</el-radio>
            <el-radio :label="2">自带思考</el-radio>
          </el-radio-group>
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                选择深度思考模式：全局思考使用推理模型混合调用，自带思考使用模型本身的思考能力
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="formPackage.deepThinkingType > 0"
          label="深度思考系数"
          prop="deductDeepThink"
        >
          <el-input
            v-model.number="formPackage.deductDeepThink"
            style="width: 400px"
            placeholder="请填写深度思考积分系数"
          />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 150px">开启深度思考后，扣除积分将在基础积分上乘以此系数</div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="联网搜索"
          prop="isNetworkSearch"
        >
          <el-switch v-model="formPackage.isNetworkSearch" />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">开启后模型将启用联网搜索功能，用户端将显示联网搜索按钮</div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1].includes(Number(formPackage.keyType))"
          label="上下文限制"
          prop="maxRounds"
        >
          <el-input
            v-model.number="formPackage.maxRounds"
            placeholder="请填写允许用户选择的最高上下文条数！"
          />
        </el-form-item>
        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="上下文Tokens"
          prop="maxModelTokens"
        >
          <el-input
            v-model.number="formPackage.maxModelTokens"
            placeholder="请填写模型最大Token、不填写默认使用默认！"
          />
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="回复Tokens"
          prop="max_tokens"
        >
          <el-input
            v-model.number="formPackage.max_tokens"
            placeholder="请填写模型最大回复、不填写默认使用默认！"
          />
        </el-form-item>

        <el-form-item v-if="[1, 3].includes(Number(formPackage.keyType))" label="">
          <el-button type="primary" link @click="fillTokensFromCatalog(formPackage.model)">
            根据「账号关联模型」填入 Token 限额
          </el-button>
          <span class="text-xs text-gray-400 ml-2">
            支持完整 ID（如 openai/gpt-4o）或短名（如 gpt-4o）：维护表按后缀匹配，公开源会尝试常见 provider/
            前缀。新增模型保存前会自动尝试填入。
          </span>
        </el-form-item>

        <el-form-item label="调用超时时间" prop="timeout">
          <el-input
            v-model.number="formPackage.timeout"
            placeholder="请填写key的超时时间单位（秒）！"
          />
        </el-form-item>

        <el-form-item label="图片解析" prop="isImageUpload">
          <el-radio-group v-model="formPackage.isImageUpload">
            <el-radio :label="0"> 不使用 </el-radio>
            <el-radio :label="1"> 逆向格式 </el-radio>
            <el-radio :label="2"> GPT Vision </el-radio>
            <el-radio :label="3" :disabled="true" @click="showDevOnlyMessage"> 全局解析 </el-radio>
          </el-radio-group>
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                选择是否开启图片解析及其格式，逆向格式【直接附带链接，仅支持逆向渠道】，GPT
                Vision【GPT Vision 的识图格式】，全局解析【支持所有格式的图片解析，仅开发版支持】
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>
        <el-form-item label="文件解析" prop="isFileUpload">
          <el-radio-group v-model="formPackage.isFileUpload">
            <el-radio :label="0"> 不使用 </el-radio>
            <el-radio :label="1"> 逆向格式 </el-radio>
            <el-radio :label="2" :disabled="true" @click="showDevOnlyMessage"> 向量解析 </el-radio>
          </el-radio-group>
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                选择是否开启文件解析及其格式，逆向格式【直接附带链接，仅支持逆向渠道】，向量解析【内置的文件分析，支持全模型分析带文字的文件，请注意
                tokens 消耗，仅开发版支持】
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="token 关联计费"
          prop="isTokenBased"
        >
          <el-switch v-model="formPackage.isTokenBased" />
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                关联 token 的梯度计费模型，每次扣除的积分 = 单次扣除金额 *（token 消耗 / token
                计费比例）结果向上取整【例如单次扣除金额为 3 积分，token 计费比例为
                1000，用户调用消耗 2500 token，那么扣除的积分为 3 *（2500 / 1000）向上取整 9 积分】
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item
          v-if="[1, 3].includes(Number(formPackage.keyType))"
          label="token计费比例"
          prop="tokenFeeRatio"
        >
          <el-input
            v-model.number="formPackage.tokenFeeRatio"
            placeholder="请填写token计费比例"
            style="width: 80%"
          />
        </el-form-item>

        <el-form-item label="预设类型" prop="systemPromptType">
          <el-radio-group v-model="formPackage.systemPromptType">
            <el-radio :label="0">关闭预设</el-radio>
            <el-radio :label="1">附加模式</el-radio>
            <el-radio :label="2">覆盖模式</el-radio>
          </el-radio-group>
          <el-tooltip class="box-item" effect="dark" placement="right">
            <template #content>
              <div style="width: 250px">
                选择模型预设的工作模式：关闭预设-不使用预设，附加模式-在用户输入基础上附加预设，覆盖模式-使用预设覆盖用户输入
              </div>
            </template>
            <el-icon class="ml-3 cursor-pointer">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="模型预设" prop="systemPrompt">
          <el-input
            v-model="formPackage.systemPrompt"
            type="textarea"
            :rows="4"
            placeholder="请输入模型模型预设内容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="mr-5 flex justify-end">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="handlerSubmit(formPackageRef)">
            {{ dialogButton }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<!-- <style scoped>
  .drawing-type-grid .radio-row {
    display: flex;
    gap: 20px;
    margin-bottom: 8px;
  }

  .drawing-type-grid .radio-row:last-child {
    margin-bottom: 0;
  }
</style> -->
