import { sunoUploadAudioAPI, type SunoUploadProgressHandler } from '@/api/sunoMusic'

/**
 * 上传音频（进度回调走 XHR multipart）。
 * 回退策略（multipart → S3 管道 → URL 桥接）均在服务端 uploadAudioSmart 内完成；
 * 切勿在前端再调 upload/pipeline，否则 ephone 等 submit 网关会命中返回 HTML 的错误路径。
 */
export async function sunoUploadAudioSmart(
  model: string,
  file: File,
  onProgress?: SunoUploadProgressHandler
): Promise<unknown> {
  return sunoUploadAudioAPI(model, file, onProgress)
}
