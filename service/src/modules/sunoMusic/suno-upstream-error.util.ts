/** 上游 Suno / 网关常见英文错误 → 中文（面向用户） */

export function isBenignSunoFeedMiss(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes('record not found') ||
    t.includes('clip not found') ||
    t.includes('clip_id') ||
    t.includes('job not exi') ||
    t.includes('task not found') ||
    t === 'not found' ||
    t.includes('不存在')
  );
}

export function humanizeSunoUpstreamError(message: string, httpStatus?: number): string {
  const raw = String(message || '').trim();
  const t = raw.toLowerCase();

  if (!raw) {
    if (httpStatus === 502 || httpStatus === 504) return '音乐上游服务暂时不可用，请稍后重试';
    return '音乐上游返回失败，请稍后重试';
  }

  if (isBenignSunoFeedMiss(raw)) {
    return '找不到该曲目记录，可能已过期、尚未生成完成或 clip_id 无效';
  }
  if (t.includes('matches an existing recording') || t.includes('catalog')) {
    return '音频与平台曲库已有录音匹配，无法上传。请使用原创或未发行素材';
  }
  if (t.includes('insufficient') || t.includes('balance')) {
    return '积分余额不足，请先充值';
  }
  if (t.includes('rate limit') || t.includes('too many request')) {
    return '请求过于频繁，请稍后再试';
  }
  if (t.includes('unauthorized') || (t.includes('invalid') && t.includes('key'))) {
    return '音乐模型鉴权失败，请检查后台 API 密钥配置';
  }
  if (t.includes('timeout') || t.includes('timed out') || httpStatus === 504) {
    return '上游响应超时，请稍后重试';
  }
  if (t.includes('payload too large') || t.includes('file too large')) {
    return '上传文件过大，请压缩后重试';
  }
  if (t.includes('model') && t.includes('not found')) {
    return '音乐模型未配置或不可用';
  }
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;

  return raw;
}
