<script setup lang="ts">
import type { UploadRequestHandler, UploadRequestOptions } from 'element-plus'
import { ElMessage } from 'element-plus'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import apiUser from '@/api/modules/user'
import uploadApi from '@/api/modules/upload'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/ui/shadcn/ui/form'

defineOptions({
  name: 'EditProfileBasicForm',
})

const appAccountStore = useAppAccountStore()

const loadingInfo = ref(true)
const saving = ref(false)

const initialUsername = ref('')
const initialEmail = ref('')
const initialNickname = ref('')
const initialAvatar = ref('')

const avatarUrl = ref('')

const schema = z.object({
  nickname: z
    .string()
    .max(12, '昵称最多 12 个字符')
    .refine(v => v.length === 0 || v.length >= 2, {
      message: '昵称需 2–12 个字符，留空则不修改昵称',
    }),
})

const form = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: {
    nickname: '',
  },
})

function applyUserInfo(userInfo: Record<string, unknown>) {
  initialUsername.value = String(userInfo.username ?? '')
  initialEmail.value = String(userInfo.email ?? '')
  initialNickname.value = String(userInfo.nickname ?? '')
  initialAvatar.value = String(userInfo.avatar ?? '')
  avatarUrl.value = initialAvatar.value
  form.resetForm({ values: { nickname: initialNickname.value } })
}

onMounted(() => {
  loadingInfo.value = true
  apiUser
    .getInfo()
    .then((res: any) => {
      const userInfo = res?.data?.userInfo
      if (userInfo) {
        applyUserInfo(userInfo)
      }
    })
    .catch(() => {})
    .finally(() => {
      loadingInfo.value = false
    })
})

const customUpload: UploadRequestHandler = (options: UploadRequestOptions) => {
  const { file, onSuccess, onError } = options
  const formData = new FormData()
  formData.append('file', file as File)
  return uploadApi
    .uploadFile(formData, 'system/user')
    .then((response: any) => {
      const url = response?.data
      if (url) {
        avatarUrl.value = url
        onSuccess?.(response)
        faToast.success('头像上传成功')
      }
      else {
        onError?.(new Error('no url') as never)
        ElMessage.error('上传成功但未获取到文件地址')
      }
    })
    .catch((err) => {
      onError?.(err as never)
      ElMessage.error('上传失败')
    })
}

const beforeAvatarUpload: (rawFile: File) => boolean = (rawFile) => {
  const okTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']
  const ext = rawFile.name.toLowerCase().slice(rawFile.name.lastIndexOf('.'))
  const okExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'].includes(ext)
  if (!okTypes.includes(rawFile.type) && !okExt) {
    ElMessage.error('仅支持 PNG、JPEG、GIF、WebP、ICO 格式')
    return false
  }
  if (rawFile.size / 1024 > 3000) {
    ElMessage.error('图片大小不能超过 3000KB')
    return false
  }
  return true
}

const onSubmit = form.handleSubmit(async (values) => {
  const payload: { nickname?: string; avatar?: string } = {}

  const nick = values.nickname.trim()
  if (nick !== initialNickname.value) {
    if (nick.length > 0 && nick.length < 2) {
      faToast.error('昵称需 2–12 个字符')
      return
    }
    if (nick.length >= 2) {
      payload.nickname = nick
    }
  }

  if (avatarUrl.value && avatarUrl.value !== initialAvatar.value) {
    payload.avatar = avatarUrl.value
  }

  if (Object.keys(payload).length === 0) {
    faToast.info('没有需要保存的修改')
    return
  }

  saving.value = true
  try {
    await appAccountStore.updateProfile(payload)
    initialNickname.value = appAccountStore.nickname
    initialAvatar.value = appAccountStore.avatar
    avatarUrl.value = appAccountStore.avatar
    form.resetForm({ values: { nickname: appAccountStore.nickname } })
    faToast.success('保存成功')
  }
  finally {
    saving.value = false
  }
})
</script>

<template>
  <div class="w-full max-w-lg flex-col-stretch-center">
    <div class="mb-6 space-y-2 text-center md:text-start">
      <h3 class="text-2xl font-bold tracking-tight md:text-3xl">
        基本设置
      </h3>
      <p class="text-sm text-muted-foreground md:text-base">
        管理头像与昵称；登录账号与邮箱由系统分配，仅可查看
      </p>
    </div>

    <div v-if="loadingInfo" class="flex justify-center py-16">
      <FaIcon name="i-svg-spinners:ring-resize" class="size-8 text-muted-foreground" />
    </div>

    <form v-else class="w-full space-y-6" @submit="onSubmit">
      <div class="flex flex-col items-center gap-6 md:flex-row md:items-start">
        <div class="flex flex-col items-center gap-3">
          <FaAvatar :src="avatarUrl" class="size-24 rounded-xl ring-2 ring-border" shape="square">
            <FaIcon name="i-mdi:account" class="size-12 text-muted-foreground/60" />
          </FaAvatar>
          <el-upload
            :show-file-list="false"
            :http-request="customUpload"
            :before-upload="beforeAvatarUpload"
            accept="image/png,image/jpeg,image/gif,image/webp,.ico"
          >
            <FaButton type="button" variant="outline" size="sm" class="cursor-pointer">
              上传头像
            </FaButton>
          </el-upload>
          <p class="max-w-[11rem] text-center text-xs text-muted-foreground leading-relaxed">
            PNG / JPEG / GIF / WebP / ICO，单张不超过 3MB
          </p>
        </div>

        <div class="min-w-0 flex-1 space-y-4 w-full">
          <div class="space-y-1">
            <div class="text-xs font-medium text-muted-foreground">
              登录账号
            </div>
            <FaInput :model-value="initialUsername" class="w-full" disabled readonly />
          </div>
          <div class="space-y-1">
            <div class="text-xs font-medium text-muted-foreground">
              邮箱
            </div>
            <FaInput :model-value="initialEmail || '—'" class="w-full" disabled readonly />
          </div>
          <FormField v-slot="{ componentField, errors }" name="nickname">
            <FormItem class="relative space-y-2">
              <FormLabel>昵称</FormLabel>
              <FormControl>
                <FaInput
                  placeholder="2–12 个字符，用于界面展示"
                  class="w-full"
                  maxlength="12"
                  :class="{ 'border-destructive': errors.length }"
                  v-bind="componentField"
                >
                  <template #start>
                    <FaIcon name="i-mdi:account-outline" />
                  </template>
                </FaInput>
              </FormControl>
              <Transition
                enter-active-class="transition-opacity"
                enter-from-class="opacity-0"
                leave-active-class="transition-opacity"
                leave-to-class="opacity-0"
              >
                <FormMessage class="text-xs" />
              </Transition>
            </FormItem>
          </FormField>
        </div>
      </div>

      <FaButton :loading="saving" size="lg" class="w-full md:w-auto md:min-w-32" type="submit">
        保存
      </FaButton>
    </form>
  </div>
</template>
