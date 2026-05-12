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

/** 官方预设 Zoom Out 1.5x / 2x 按钮 */
export function isPresetOutpaintCustomId(customId: string): boolean {
  const s = String(customId || '');
  return /MJ::Outpaint::(?:50|75)::/i.test(s) || /^Outpaint::(?:50|75)::/i.test(s);
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
 * 预设 Outpaint 是否改走 Custom Zoom 链。
 * 未设置 `MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM` 时，若 `MJ_PROXY_HOST_MARKERS` 命中 `proxyUrl` 则启用；
 * 设为 1/true/on 全局开启，0/false/off 关闭。
 */
export function presetOutpaintCustomZoomEnabledForProxy(proxyUrl: string): boolean {
  const v = process.env.MJ_OUTPAINT_PRESET_USE_CUSTOM_ZOOM?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'all') return true;
  return proxyUrlMatchesMjHostMarkers(proxyUrl);
}
