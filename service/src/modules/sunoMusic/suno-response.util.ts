/** 解析聚合网关常见的 { code, data, message } 包装体 */

const SUNO_CLIP_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelySunoHtmlBody(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  const s = data.trim().slice(0, 800).toLowerCase();
  if (!s) return false;
  return (
    s.startsWith('<!doctype') ||
    s.startsWith('<html') ||
    (s.includes('<html') && (s.includes('</body>') || s.includes('<head>'))) ||
    (s.includes('<script') && s.includes('</html>'))
  );
}

/** 仅将 UUID 形态或短 token 视为 clip / task id，避免把整页 HTML 当 id */
export function isLikelySunoClipId(value: string): boolean {
  const t = value.trim();
  if (!t || t.length > 80 || /\s/.test(t) || t.includes('<')) return false;
  if (SUNO_CLIP_ID_RE.test(t)) return true;
  if (t.length >= 8 && t.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(t)) return true;
  return false;
}

export const SUNO_UPSTREAM_HTML_HINT =
  '上游返回了网页 HTML 而非 JSON。请确认 proxyUrl 为 API 根地址（如 https://api.ephone.ai，勿加 /v1）。ephone 等聚合使用 /suno/submit/music，系统已对 ephone.ai 自动适配；其它同类网关可设 SUNO_API_FLAVOR=submit。';

export function unwrapSunoEnvelope(data: unknown): unknown {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return data;
  const o = data as Record<string, unknown>;
  const code = String(o.code ?? '').toLowerCase();
  if ((code === 'success' || code === 'ok') && o.data !== undefined) {
    return o.data;
  }
  return data;
}

function errorMessageFromField(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err.trim();
  if (typeof err === 'object' && !Array.isArray(err)) {
    const e = err as Record<string, unknown>;
    return String(e.message ?? e.msg ?? e.detail ?? '').trim();
  }
  return '';
}

export function extractSunoErrorMessage(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') {
    if (isLikelySunoHtmlBody(data)) return SUNO_UPSTREAM_HTML_HINT;
    const t = data.trim();
    if (t.length > 500) return `${t.slice(0, 200)}…`;
    return t;
  }
  if (typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  const code = String(o.code ?? '').toLowerCase();
  if (code && code !== 'success' && code !== 'ok') {
    const msg = String(o.message ?? o.msg ?? '').trim();
    if (msg) return msg;
  }
  const nestedErr = errorMessageFromField(o.error);
  const parts = [o.message, nestedErr, o.details, o.msg]
    .map(x => (x != null ? String(x).trim() : ''))
    .filter(Boolean);
  if (parts.length) return parts.join(' · ');
  const inner = unwrapSunoEnvelope(data);
  if (inner !== data && inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return extractSunoErrorMessage(inner);
  }
  return '';
}

/** 从 generate / concat 等响应中提取 clip 列表 */
export function extractSunoClipsFromBody(data: unknown): { id: string; status?: string }[] {
  const unwrapped = unwrapSunoEnvelope(data);
  if (typeof unwrapped === 'string' && isLikelySunoClipId(unwrapped)) {
    return [{ id: unwrapped.trim(), status: 'submitted' }];
  }
  if (!unwrapped || typeof unwrapped !== 'object') return [];
  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map(item => clipIdFromItem(item))
      .filter((x): x is { id: string; status?: string } => Boolean(x));
  }
  const o = unwrapped as Record<string, unknown>;
  const raw = o.clips ?? o.clip_list ?? o.items;
  if (Array.isArray(raw)) {
    return raw
      .map(item => clipIdFromItem(item))
      .filter((x): x is { id: string; status?: string } => Boolean(x));
  }
  const single = clipIdFromItem(o);
  return single ? [single] : [];
}

function clipIdFromItem(item: unknown): { id: string; status?: string } | null {
  if (!item || typeof item !== 'object') return null;
  const c = item as Record<string, unknown>;
  const id = String(c.id ?? c.clip_id ?? '').trim();
  if (!id) return null;
  return { id, status: c.status != null ? String(c.status) : undefined };
}

export function extractSunoPersonaId(data: unknown): string {
  const unwrapped = unwrapSunoEnvelope(data);
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) {
    if (typeof unwrapped === 'string') {
      const t = unwrapped.trim();
      return isLikelySunoClipId(t) ? t : '';
    }
    return '';
  }
  const o = unwrapped as Record<string, unknown>;
  return String(o.id ?? o.persona_id ?? '').trim();
}

function normalizeSunoFetchTaskStatus(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'COMPLETE' || s === 'COMPLETED')
    return 'complete';
  if (s === 'FAILURE' || s === 'FAILED' || s === 'ERROR') return 'error';
  if (s === 'IN_PROGRESS' || s === 'PROCESSING' || s === 'RUNNING' || s === 'STREAMING') {
    return 'streaming';
  }
  if (s === 'QUEUED' || s === 'SUBMITTED' || s === 'PENDING') return 'queued';
  return 'streaming';
}

function clipRowsFromArray(arr: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const c = x as Record<string, unknown>;
    const id = String(c.id ?? c.clip_id ?? '').trim();
    if (!id) continue;
    const st = c.status != null ? String(c.status) : c.state != null ? String(c.state) : '';
    out.push({
      ...c,
      id,
      clip_id: id,
      status: st ? normalizeSunoFetchTaskStatus(st) : c.status,
    });
  }
  return out;
}

/**
 * ephone / 文档-1：GET /suno/fetch/{task_id}
 * 完成时 data.data[] 为曲目；进行中时返回占位条目供前端继续轮询。
 */
export function extractClipsFromSunoFetchTask(
  data: unknown,
  taskIdFallback?: string,
): Record<string, unknown>[] {
  const unwrapped = unwrapSunoEnvelope(data);
  if (Array.isArray(unwrapped)) return clipRowsFromArray(unwrapped);

  if (!unwrapped || typeof unwrapped !== 'object') return [];

  const task = unwrapped as Record<string, unknown>;
  const fail = String(task.fail_reason ?? '').trim();
  const stRaw = String(task.status ?? task.state ?? '').trim();
  const st = normalizeSunoFetchTaskStatus(stRaw);

  if (st === 'error' || fail) {
    throw new Error(fail || stRaw || 'Suno 任务失败');
  }

  const songs = task.songs ?? task.clips ?? task.items;
  if (Array.isArray(songs)) return clipRowsFromArray(songs);

  const inner = task.data;
  if (Array.isArray(inner)) return clipRowsFromArray(inner);
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const nested = inner as Record<string, unknown>;
    if (Array.isArray(nested.data)) return clipRowsFromArray(nested.data);
    if (Array.isArray(nested.clips)) return clipRowsFromArray(nested.clips);
    if (Array.isArray(nested.songs)) return clipRowsFromArray(nested.songs);
  }

  const tid = taskIdFallback || String(task.task_id ?? task.id ?? '').trim();
  if (tid && st !== 'complete') {
    return [
      {
        id: tid,
        clip_id: tid,
        status: st === 'queued' ? 'queued' : 'streaming',
        title: String(task.title ?? '').trim() || undefined,
      },
    ];
  }

  return [];
}

export interface SunoLyricsPollResult {
  taskId: string;
  text: string;
  title: string;
  status: 'pending' | 'complete' | 'error';
  failReason?: string;
}

/** POST submit/lyrics 或 generate/lyrics 返回的 task_id */
export function extractLyricsTaskIdFromSubmit(data: unknown): string {
  const unwrapped = unwrapSunoEnvelope(data);
  if (typeof unwrapped === 'string' && isLikelySunoClipId(unwrapped)) return unwrapped.trim();
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return '';
  const o = unwrapped as Record<string, unknown>;
  return String(o.task_id ?? o.id ?? '').trim();
}

/**
 * GET fetch/{task_id} 或 GET lyrics/{task_id}，action=LYRICS
 * 完成时 data.text / data.title（文档-1 submit、文档-2 示例）
 */
export function extractLyricsFromSunoFetchTask(data: unknown): SunoLyricsPollResult {
  const empty: SunoLyricsPollResult = { taskId: '', text: '', title: '', status: 'pending' };
  const unwrapped = unwrapSunoEnvelope(data);
  let task: Record<string, unknown> | null = null;
  if (Array.isArray(unwrapped) && unwrapped.length > 0) {
    const first = unwrapped[0];
    if (first && typeof first === 'object') task = first as Record<string, unknown>;
  } else if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    task = unwrapped as Record<string, unknown>;
  }
  if (!task) return empty;

  const taskId = String(task.task_id ?? task.id ?? '').trim();
  const fail = String(task.fail_reason ?? '').trim();
  const stRaw = String(task.status ?? task.state ?? '')
    .trim()
    .toUpperCase();

  if (stRaw === 'FAILURE' || stRaw === 'FAILED' || stRaw === 'ERROR' || fail) {
    return {
      taskId,
      text: '',
      title: '',
      status: 'error',
      failReason: fail || stRaw || '歌词任务失败',
    };
  }

  const inner = task.data;
  let lyricBlock: Record<string, unknown> | null = null;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    lyricBlock = inner as Record<string, unknown>;
  }

  const text = String(lyricBlock?.text ?? task.text ?? '').trim();
  const title = String(lyricBlock?.title ?? task.title ?? '').trim();
  const innerSt = String(lyricBlock?.status ?? '').toLowerCase();

  const done =
    stRaw === 'SUCCESS' ||
    stRaw === 'SUCCEEDED' ||
    stRaw === 'COMPLETE' ||
    stRaw === 'COMPLETED' ||
    innerSt === 'complete' ||
    innerSt === 'completed' ||
    innerSt === 'success';

  if (done && text) {
    return { taskId, text, title, status: 'complete' };
  }

  return { taskId, text, title, status: 'pending' };
}

export function extractSunoTagsExpanded(data: unknown): string {
  const unwrapped = unwrapSunoEnvelope(data);
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) {
    return typeof unwrapped === 'string' ? unwrapped.trim() : '';
  }
  const o = unwrapped as Record<string, unknown>;
  return String(o.upsampled_tags ?? o.tags ?? '').trim();
}
