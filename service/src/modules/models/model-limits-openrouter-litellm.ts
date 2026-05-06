/**
 * 仅从 OpenRouter 公开 Models API + LiteLLM model_prices_and_context_window.json 解析上下文与单次回复上限。
 */

export type LimitSource = 'openrouter' | 'litellm' | 'merged';

export interface ResolvedLimits {
  maxModelTokens: number;
  max_tokens: number;
  source: LimitSource;
  displayName?: string;
}

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export const LITELLM_COST_MAP_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

export interface OpenRouterModelRow {
  id: string;
  name?: string;
  context_length?: number;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
  };
}

export interface OpenRouterModelsResponse {
  data?: OpenRouterModelRow[];
}

/** LiteLLM 条目中与对话相关的数字字段 */
export function extractLiteLLmChatLimits(entry: Record<string, unknown>): {
  input: number | null;
  output: number | null;
} | null {
  const mode = entry.mode as string | undefined;
  if (mode && mode !== 'chat') {
    return null;
  }

  const maxInput = typeof entry.max_input_tokens === 'number' ? entry.max_input_tokens : null;
  const maxOutExplicit =
    typeof entry.max_output_tokens === 'number' ? entry.max_output_tokens : null;
  const maxLegacy = typeof entry.max_tokens === 'number' ? entry.max_tokens : null;

  if (maxInput == null && maxOutExplicit == null && maxLegacy == null) {
    return null;
  }

  const output = maxOutExplicit ?? maxLegacy ?? null;

  return {
    input: maxInput,
    output,
  };
}

/** 构建 LiteLLM 查找表：key -> limits */
export function buildLiteLLmChatIndex(
  root: Record<string, unknown>,
): Map<string, { input: number | null; output: number | null }> {
  const map = new Map<string, { input: number | null; output: number | null }>();
  for (const key of Object.keys(root)) {
    if (key === 'sample_spec') continue;
    const entry = root[key];
    if (!entry || typeof entry !== 'object') continue;
    const lim = extractLiteLLmChatLimits(entry as Record<string, unknown>);
    if (!lim) continue;
    map.set(key, lim);
  }
  return map;
}

/** 为 LiteLLM 生成候选键（含去前缀别名） */
export function liteLLmLookupKeys(modelId: string): string[] {
  const m = modelId.trim();
  if (!m) return [];
  const keys = new Set<string>();
  keys.add(m);
  const slash = m.indexOf('/');
  if (slash > 0) {
    keys.add(m.slice(slash + 1));
  }
  return [...keys];
}

export function lookupLiteLLmLimits(
  modelId: string,
  lmIndex: Map<string, { input: number | null; output: number | null }>,
): { input: number | null; output: number | null } | null {
  for (const k of liteLLmLookupKeys(modelId)) {
    const hit = lmIndex.get(k);
    if (hit) return hit;
  }
  return null;
}

/** OpenRouter 单行 + LiteLLM 别名命中合并 */
export function mergeResolvedLimits(
  orRow: OpenRouterModelRow | undefined,
  lmHit: { input: number | null; output: number | null } | null,
  opts?: { catalogModelId?: string },
): ResolvedLimits | null {
  const ctxOr = orRow?.top_provider?.context_length ?? orRow?.context_length ?? undefined;
  const ctxLm = lmHit?.input ?? undefined;

  let ctx: number | undefined;
  if (typeof ctxOr === 'number' && ctxOr > 0) {
    ctx = ctxOr;
  } else if (typeof ctxLm === 'number' && ctxLm > 0) {
    ctx = ctxLm;
  }
  if (ctx === undefined || ctx <= 0) {
    return null;
  }

  const orOut = orRow?.top_provider?.max_completion_tokens;
  let outNum: number;
  if (typeof orOut === 'number' && orOut > 0) {
    outNum = orOut;
  } else if (lmHit?.output != null && lmHit.output > 0) {
    outNum = lmHit.output;
  } else {
    outNum = Math.min(8192, ctx);
  }

  let source: LimitSource = 'litellm';
  if (orRow && lmHit) {
    source = 'merged';
  } else if (orRow) {
    source = 'openrouter';
  }

  /** LiteLLM JSON 无展示名字段；无 OpenRouter 行时用语义上的「目录模型键」作名称 */
  const displayName = orRow?.name ?? opts?.catalogModelId;

  return {
    maxModelTokens: ctx,
    max_tokens: outNum,
    source,
    displayName,
  };
}

export function resolveLimitsForModelId(
  modelId: string,
  orById: Map<string, OpenRouterModelRow>,
  lmIndex: Map<string, { input: number | null; output: number | null }>,
): ResolvedLimits | null {
  const trimmed = modelId.trim();
  if (!trimmed) return null;

  const orRow = orById.get(trimmed);
  const lmHit = lookupLiteLLmLimits(trimmed, lmIndex);
  if (!orRow && !lmHit) return null;

  return mergeResolvedLimits(orRow, lmHit, { catalogModelId: trimmed });
}

/** 常见 OpenRouter 风格前缀：仅「短模型名」时依次尝试 */
const OPENROUTER_STYLE_PREFIXES = [
  'openai/',
  'anthropic/',
  'google/',
  'x-ai/',
  'mistralai/',
  'meta-llama/',
  'deepseek/',
  'qwen/',
  'moonshotai/',
  'nvidia/',
  'z-ai/',
  'openrouter/',
  'perplexity/',
  'cohere/',
  'microsoft/',
  'ibm-granite/',
  'amazon/',
  'mistral/',
  'ai21/',
];

/**
 * 生成用于匹配的候选完整 ID：原样、去前缀后的短名、短名 + 常见 provider/ 前缀
 */
export function expandModelIdCandidates(raw: string): string[] {
  const mid = raw.trim();
  if (!mid) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  add(mid);

  const lastSlash = mid.lastIndexOf('/');
  const shortName = lastSlash >= 0 ? mid.slice(lastSlash + 1) : mid;
  if (shortName && shortName !== mid) {
    add(shortName);
  }

  if (!mid.includes('/')) {
    for (const p of OPENROUTER_STYLE_PREFIXES) {
      add(p + mid);
    }
  }

  return out;
}

function scoreOpenRouterIdForShortName(fullId: string, shortName: string): number {
  if (fullId === shortName) return 0;
  if (fullId === `openai/${shortName}`) return 1;
  if (fullId.startsWith('openai/')) return 2;
  return 10 + fullId.length;
}

function collectOpenRouterSuffixMatches(
  shortName: string,
  orById: Map<string, OpenRouterModelRow>,
): string[] {
  const matches: string[] = [];
  const sn = shortName.trim();
  if (!sn || sn.includes('/')) return matches;

  for (const id of orById.keys()) {
    if (id === sn) {
      matches.push(id);
      continue;
    }
    if (id.endsWith(`/${sn}`)) {
      matches.push(id);
      continue;
    }
    const base = id.includes(':') ? id.slice(0, id.indexOf(':')) : id;
    if (base.endsWith(`/${sn}`)) {
      matches.push(id);
    }
  }

  const uniq = [...new Set(matches)];
  uniq.sort((a, b) => scoreOpenRouterIdForShortName(a, sn) - scoreOpenRouterIdForShortName(b, sn));
  return uniq;
}

function collectLiteLLmSuffixMatches(
  shortName: string,
  lmIndex: Map<string, { input: number | null; output: number | null }>,
): string[] {
  const matches: string[] = [];
  const sn = shortName.trim();
  if (!sn || sn.includes('/')) return matches;

  for (const k of lmIndex.keys()) {
    if (k === sn) {
      matches.unshift(k);
      continue;
    }
    if (k.endsWith(`/${sn}`)) {
      matches.push(k);
    }
  }
  const uniq = [...new Set(matches)];
  uniq.sort((a, b) => a.length - b.length);
  return uniq;
}

/**
 * 在精确 resolve 失败后：短名后缀匹配 OpenRouter / LiteLLM，并尝试常见 provider 前缀。
 * @returns matchedLimits + 实际命中的模型 ID（用于提示用户）
 */
export function resolveLimitsForModelIdFlexible(
  modelId: string,
  orById: Map<string, OpenRouterModelRow>,
  lmIndex: Map<string, { input: number | null; output: number | null }>,
): { limits: ResolvedLimits; matchedModelId: string } | null {
  const trimmed = modelId.trim();
  if (!trimmed) return null;

  for (const cand of expandModelIdCandidates(trimmed)) {
    const r = resolveLimitsForModelId(cand, orById, lmIndex);
    if (r) {
      return { limits: r, matchedModelId: cand };
    }
  }

  const shortName = trimmed.includes('/') ? trimmed.slice(trimmed.lastIndexOf('/') + 1) : trimmed;

  for (const id of collectOpenRouterSuffixMatches(shortName, orById)) {
    const r = resolveLimitsForModelId(id, orById, lmIndex);
    if (r) {
      return { limits: r, matchedModelId: id };
    }
  }

  for (const k of collectLiteLLmSuffixMatches(shortName, lmIndex)) {
    const orRow = orById.get(k);
    const lmHit = lmIndex.get(k) ?? null;
    const r = mergeResolvedLimits(orRow, lmHit, { catalogModelId: k });
    if (r) {
      return { limits: r, matchedModelId: k };
    }
  }

  return null;
}

export function openRouterListToMap(
  data: OpenRouterModelRow[] | undefined,
): Map<string, OpenRouterModelRow> {
  const map = new Map<string, OpenRouterModelRow>();
  if (!data?.length) return map;
  for (const row of data) {
    if (row?.id) map.set(row.id, row);
  }
  return map;
}
