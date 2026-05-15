/**
 * 预设 Zoom Out（MJ::Outpaint::50|75）在部分聚合网关上 submit/action 虽返回成功，
 * 执行期仍常报 invalid_parameter；改走 Custom Zoom 按钮 + submit/modal 可规避。
 * OpenAPI：submit/action 仅 customId+taskId(+notifyHook)；submit/modal 为 taskId+prompt(+maskBase64)。
 */

import { proxyUrlMatchesMjHostMarkers } from './mj-proxy-host-markers';

export function unwrapMjSubmitEnvelope(data: unknown): Record<string, unknown> {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return {};
  const o = data as Record<string, unknown>;
  const inner = o.data;
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return o;
}

export function unwrapMjTaskFromFetchData(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      return o.data as Record<string, unknown>;
    }
    return o;
  }
  return {};
}

/** 官方预设 Zoom Out 1.5x / 2x 按钮（及少数网关省略 MJ:: 前缀的等价写法） */
export function isPresetOutpaintCustomId(customId: string): boolean {
  const s = String(customId || '');
  if (/MJ::Outpaint::(?:50|75)::/i.test(s) || /^Outpaint::(?:50|75)::/i.test(s)) return true;
  // 如 MJ::JOB::Outpaint::50::…、::Outpaint::75:: 等变体
  if (/Outpaint::(?:50|75)(::|$)/i.test(s) && !/custom[_\s:-]*zoom|CUSTOM_ZOOM/i.test(s)) return true;
  return false;
}

export function outpaintTargetZoomNumber(outpaintCustomId: string): string {
  if (/Outpaint::75/i.test(outpaintCustomId)) return '1.5';
  if (/Outpaint::50/i.test(outpaintCustomId)) return '2';
  return '';
}

function mjTaskButtonsArray(task: Record<string, unknown>): unknown[] {
  const pr = task.properties as Record<string, unknown> | undefined;
  const a = task.buttons;
  const b = pr?.buttons;
  const out: unknown[] = [];
  if (Array.isArray(a)) out.push(...a);
  if (Array.isArray(b)) out.push(...b);
  return out;
}

function mjCustomIdIsVaryRegionLike(cid: string): boolean {
  const s = String(cid || '');
  if (/Outpaint::/i.test(s)) return false;
  return /::[Ii]npaint::|[Mm][Jj]::[Ii]npaint|vary[_\s:-]*region|VaryRegion/i.test(s);
}

/** 父任务按钮里找 Custom Zoom（非 Outpaint、非 Vary Region） */
export function mjTaskButtonCustomZoomCustomId(task: Record<string, unknown>): string {
  const buttons = mjTaskButtonsArray(task);
  for (const item of buttons) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const cid = String(b.customId || '');
    if (!cid) continue;
    if (/Outpaint::/i.test(cid)) continue;
    if (mjCustomIdIsVaryRegionLike(cid)) continue;
    if (
      /custom[_\s:-]*zoom|zoom[_\s:-]*custom|customzoom|::CustomZoom::|::custom_zoom::|JOB::.*custom.*zoom/i.test(
        cid,
      )
    ) {
      return cid;
    }
    const raw = `${b.emoji || ''} ${b.label || ''}`.trim();
    if (/custom\s*zoom|自定义变焦|自定义缩放|定制变焦/i.test(raw)) return cid;
  }
  return '';
}

function stripMjZoomParam(line: string): string {
  return line
    .replace(/\s--zoom\s+[\d.]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Custom Zoom 等 submit/modal：部分聚合在含 `--zoom` 的 prompt 里若同时带 `--v`/`--niji` 会在执行期报 invalid_parameter */
export function stripMjModelVersionFlags(line: string): string {
  return line
    .replace(/(^|\s)--v\s+\d+\b/gi, '$1')
    .replace(/(^|\s)--v\d+\b/gi, '$1')
    .replace(/(^|\s)--niji\s+\d+\b/gi, '$1')
    .replace(/(^|\s)--niji\d+\b/gi, '$1')
    .replace(/(^|\s)--draft\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstPromptLine(s: string): string {
  const line = s.split(/\r?\n/)[0]?.trim() ?? '';
  return line.replace(/^\/(?:imagine|describe|shorten)\s+/i, '').trim() || line;
}

function tryPick(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '';
  return firstPromptLine(v.trim());
}

function pickMjOutpaintParentPromptLine(task: Record<string, unknown>): string {
  const pr = task.properties as Record<string, unknown> | undefined;
  return (
    tryPick(pr?.promptEn) ||
    tryPick(task.promptEn) ||
    tryPick(pr?.finalPrompt) ||
    tryPick(task.finalPrompt) ||
    tryPick((task as Record<string, unknown>).final_prompt) ||
    tryPick(pr?.fullPrompt) ||
    tryPick(task.fullPrompt) ||
    tryPick(pr?.submitPrompt) ||
    tryPick(task.submitPrompt) ||
    tryPick(pr?.prompt) ||
    tryPick(task.prompt) ||
    tryPick(pr?.description) ||
    tryPick(task.description) ||
    ''
  );
}

function extractMjAspectRatioSuffix(full: string): string {
  const m = full.match(/\s--ar\s+(\S+)/i);
  if (!m) return '';
  return ` --ar ${m[1]}`;
}

/**
 * Custom Zoom modal 的 prompt：minimal 正文 + 父任务 --ar（缺省补 1:1）+ --zoom；默认剔除 --v 等。
 */
export function buildCustomZoomModalPromptFromTask(
  task: Record<string, unknown>,
  zoomNum: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let raw = pickMjOutpaintParentPromptLine(task);
  raw = stripMjZoomParam(raw);
  if (!raw) {
    const desc = typeof task.description === 'string' ? task.description : '';
    raw =
      desc
        .replace(/^\/(?:imagine|describe|shorten)\s+/i, '')
        .split(/\r?\n/)[0]
        ?.trim() || '';
    raw = stripMjZoomParam(raw);
  }

  const stripVer = env.MJ_OUTPAINT_CZ_MODAL_STRIP_VERSION?.trim().toLowerCase();
  const stripVerOn =
    stripVer === undefined || stripVer === '' || !['0', 'false', 'no', 'off'].includes(stripVer);
  const cleanedBase = stripVerOn ? stripMjModelVersionFlags(raw) : raw;
  const arFromParent = extractMjAspectRatioSuffix(raw);

  const appendArRaw = env.MJ_OUTPAINT_CZ_MODAL_APPEND_AR_IF_MISSING?.trim().toLowerCase();
  const appendArIfMissing =
    appendArRaw === undefined ||
    appendArRaw === '' ||
    !['0', 'false', 'no', 'off'].includes(appendArRaw);
  const defaultAr = env.MJ_OUTPAINT_CZ_MODAL_DEFAULT_AR?.trim() || '1:1';

  const style = (env.MJ_OUTPAINT_CZ_MODAL_PROMPT_STYLE || 'minimal').trim().toLowerCase();
  if (style === 'full') {
    let line = stripMjZoomParam(cleanedBase).trim();
    if (!line) line = 'image';
    return `${line} --zoom ${zoomNum}`.replace(/\s+/g, ' ').trim();
  }

  let cleaned = stripMjZoomParam(cleanedBase);
  const cut = cleaned.search(/\s--/);
  let bodyPart = (cut === -1 ? cleaned : cleaned.slice(0, cut)).trim();
  if (!bodyPart) bodyPart = 'image';

  let arPart = arFromParent;
  if (!arPart && appendArIfMissing) {
    arPart = ` --ar ${defaultAr}`;
  }

  return `${bodyPart}${arPart} --zoom ${zoomNum}`.replace(/\s+/g, ' ').trim();
}

/**
 * 预设 Outpaint 是否改走 Custom Zoom 链（与手动点 Custom Zoom 相同的两步 OpenAPI）。
 * - 显式 `MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM=0/false/off/no`：关闭，仍直连预设 Outpaint 按钮。
 * - 显式 `1/true/on/...`：开启。
 * - **未配置或为空**：默认开启。多数聚合上直连 Outpaint 易在执行期 invalid_parameter，而 CZ 链稳定；
 *   若你的上游仅支持直连，请设 `MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM=0`。
 * - `MJ_PROXY_HOST_MARKERS` 仅作历史兼容：未单独配置本变量且希望「仅部分域名开启」时，可设
 *   `MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM=markers`，此时仅当 proxyUrl 命中标记子串时为 true。
 */
export function presetOutpaintCustomZoomEnabledForProxy(
  proxyUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env.MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'all') return true;
  if (v === 'markers' || v === 'marker' || v === 'host' || v === 'hosts') {
    return proxyUrlMatchesMjHostMarkers(proxyUrl, env);
  }
  // 未设置或非 markers 模式：默认走 CZ 链
  return true;
}
