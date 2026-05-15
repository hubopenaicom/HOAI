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
  if (/Outpaint::(?:50|75)(::|$)/i.test(s) && !/custom[_\s:-]*zoom|CUSTOM_ZOOM/i.test(s))
    return true;
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

/** Describe 图链前缀：`https://… 咒语正文` */
export function stripMjDescribeLeadImageUrl(s: string): string {
  const t = String(s ?? '').trim();
  const m = /^(https?:\/\/\S+)\s+(.+)$/i.exec(t);
  if (m && m[2].trim().length > 8) return m[2].trim();
  return t;
}

/** Describe 四条咒语常见分界：1️⃣ / ① / 行首 `2、` `3.` 等（含同行内嵌） */
const MJ_DESCRIBE_SEG_SPLIT =
  /(?:^|[\r\n]+|\s)(?:(?:[1-4](?:\uFE0F\u20E3|\uFE0F?\u20E3))|(?:[①②③④])|[1-4]\s*[.\u3002\uff0e\uff09\):：、])\s*/gu;

export function hasMjDescribeMultiSpellMarkers(s: string): boolean {
  const raw = String(s ?? '');
  const re = new RegExp(MJ_DESCRIBE_SEG_SPLIT.source, 'gu');
  let n = 0;
  while (re.exec(raw)) {
    n++;
    if (n >= 2) return true;
  }
  return false;
}

/** 将 Describe 长文本拆成单条咒语（换行 / 键帽数字 / ①–④ / 1. 1、 等） */
export function splitMjDescribeInlineSegments(blob: string): string[] {
  const raw = String(blob ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim();
  if (!raw) return [];
  const parts = raw.split(MJ_DESCRIBE_SEG_SPLIT);
  const out = parts
    .map(p => stripMjDescribeLeadImageUrl(p.replace(/\s+/g, ' ').trim()))
    .filter(p => p.length > 8);
  if (out.length) return out;
  const one = stripMjDescribeLeadImageUrl(raw.replace(/\s+/g, ' ').trim());
  return one ? [one] : [];
}

function normalizeMjDescribeSpellHint(h: string): string {
  return sanitizeMjSubmitModalPromptLine(h).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 多条 Describe 咒语并存时只保留一条：有 hint（如任务 promptLabel / 用户所选咒语）则匹配最接近的一段，否则取第一条。
 */
export function pickMjDescribeSpellSegment(blob: string, hint?: string): string {
  const segs = splitMjDescribeInlineSegments(blob);
  if (segs.length <= 1) {
    return segs[0] || stripMjDescribeLeadImageUrl(String(blob ?? '').trim());
  }
  const h = hint ? normalizeMjDescribeSpellHint(hint) : '';
  if (h) {
    let best = segs[0];
    let bestScore = -1;
    for (const seg of segs) {
      const n = normalizeMjDescribeSpellHint(seg);
      if (!n) continue;
      let score = 0;
      if (n === h) score = 10000;
      else if (n.startsWith(h) || h.startsWith(n)) score = 5000 + Math.min(n.length, h.length);
      else if (n.includes(h) || h.includes(n)) score = 3000 + Math.min(n.length, h.length);
      else {
        const words = h.split(/\s+/).filter(w => w.length > 3);
        score = words.filter(w => n.includes(w)).length * 50;
      }
      if (score > bestScore) {
        bestScore = score;
        best = seg;
      }
    }
    if (bestScore > 0) return best;
  }
  return segs[0];
}

/**
 * submit/modal 的 prompt 清洗：Describe/翻译区常见行首「1️⃣」「1、」「1.」「1 」等序号，
 * 部分聚合会误把后续英文词拆成非法参数。循环剥除行首编号与零宽字符，保留正文。
 */
export function sanitizeMjSubmitModalPromptLine(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim();
  if (!s) return s;
  s = s.split(/\r?\n/)[0]?.trim() ?? s;
  /** 行首编号可多层叠写（如「1. 1、」），循环剥到干净 */
  for (let i = 0; i < 16; i++) {
    const before = s;
    /** ①–⑨ */
    s = s.replace(/^\s*[\u2460-\u2468]\s*/u, '');
    /** 键帽数字 1️⃣ */
    s = s.replace(/^\s*\d(?:\uFE0F\u20E3|\uFE0F?\u20E3)\s*/u, '');
    /** 1. / 1) / 1、 / 1： / 1。 及英文句点、全角点（后可有空白） */
    s = s.replace(/^\s*\d{1,2}[.\u3002\uff0e\uff09\):：、]\s*/u, '').trim();
    /** 1.Text（句点后无空格） */
    s = s.replace(/^\s*\d{1,2}[.\u3002\uff0e](?=\S)/u, '').trim();
    /** 行首「1 」「4 」等列表空格（仅 1–4，避免误伤年份等） */
    s = s.replace(/^\s*[1-4]\s+/, '').trim();
    if (s === before) break;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * submit/modal 完整清洗：Describe 多咒语录并取单条 → 剥行首序号 → 正文逗号 shield。
 */
export function prepareMjSubmitModalPromptLine(
  raw: string,
  hint?: string,
  opts?: { keepMjFlags?: boolean },
): string {
  let blob = String(raw ?? '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim();
  if (!blob) return blob;
  blob = stripMjDescribeLeadImageUrl(blob);
  const picked =
    hasMjDescribeMultiSpellMarkers(blob) || splitMjDescribeInlineSegments(blob).length > 1
      ? pickMjDescribeSpellSegment(blob, hint)
      : blob.split(/\r?\n/)[0]?.trim() || blob;
  const cleaned = sanitizeMjSubmitModalPromptLine(picked);
  let out = shieldMjModalAsciiCommasOutsideMjFlags(cleaned);
  /** 局部重绘：正文勿重复夹带 --ar/--stylize 等，部分聚合会误解析为非法参数（如 `Zi`） */
  if (!opts?.keepMjFlags && !/\s--zoom\s/i.test(out)) {
    out = stripMjModalPromptMjFlags(out);
  }
  return out;
}

/** 去掉 prompt 中首个 MJ 参数段（` --ar` / `--v` / `--stylize` 等）；Custom Zoom 须保留 `--zoom` 时不要调用 */
export function stripMjModalPromptMjFlags(line: string): string {
  const s = String(line ?? '').trim();
  if (!s) return s;
  const m = /\s--(?=[a-zA-Z])/i.exec(s);
  if (!m) return s.replace(/\s+/g, ' ').trim();
  return s.slice(0, m.index).replace(/\s+/g, ' ').trim();
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

/**
 * 少数聚合对 submit/modal 的 prompt 按英文逗号分段并当作「伪参数」校验，误报
 * `无法识别的参数: pear / slice`（如正文里 `orange, slice`、`leaf, pear` 或短词列表）。
 * 在首个 MJ 标志 `\s--` + 字母 之前的正文里将 ASCII `,` 换为全角 `，`，不改动尾部
 * `--no a, b`、`--style raw, smooth` 等标志段内的逗号。
 */
export function shieldMjModalAsciiCommasOutsideMjFlags(line: string): string {
  const s = String(line ?? '');
  if (!s) return s;
  const re = /\s--(?=[a-zA-Z])/i;
  const m = re.exec(s);
  if (!m) return s.replace(/,/g, '\uFF0C');
  const head = s.slice(0, m.index).replace(/,/g, '\uFF0C');
  return head + s.slice(m.index);
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
    const out = `${line} --zoom ${zoomNum}`.replace(/\s+/g, ' ').trim();
    return shieldMjModalAsciiCommasOutsideMjFlags(out);
  }

  let cleaned = stripMjZoomParam(cleanedBase);
  const cut = cleaned.search(/\s--/);
  let bodyPart = (cut === -1 ? cleaned : cleaned.slice(0, cut)).trim();
  if (!bodyPart) bodyPart = 'image';

  let arPart = arFromParent;
  if (!arPart && appendArIfMissing) {
    arPart = ` --ar ${defaultAr}`;
  }

  const out = `${bodyPart}${arPart} --zoom ${zoomNum}`.replace(/\s+/g, ' ').trim();
  return shieldMjModalAsciiCommasOutsideMjFlags(out);
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
