/**
 * Suno 上游路径适配
 *
 * - **generate**（gptgod / 文档-4）：POST /suno/generate
 * - **submit**（ephone / 文档-1 OpenAPI）：POST /suno/submit/music
 *
 * 实测 api.ephone.ai：
 *   /suno/generate → 200 HTML（错误）
 *   /suno/submit/music → 401 JSON（正确 API）
 */
export type SunoApiRouteStyle = 'suno' | 'sunoapi';
export type SunoApiFlavor = 'generate' | 'submit';

const ROUTE_SEGMENT = /^(sunoapi|suno)$/i;

function splitHostMarkers(raw: string | undefined, fallback: string): string[] {
  return (raw ?? fallback)
    .split(/[,;]/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 使用 /suno/submit/music 的聚合域名（可配置 SUNO_SUBMIT_HOST_MARKERS） */
export function resolveSunoApiFlavor(proxyUrl: string): SunoApiFlavor {
  const env = process.env.SUNO_API_FLAVOR?.trim().toLowerCase();
  if (env === 'submit' || env === 'generate') return env;
  const u = (proxyUrl || '').toLowerCase();
  const markers = splitHostMarkers(process.env.SUNO_SUBMIT_HOST_MARKERS, 'ephone.ai');
  if (markers.some(m => u.includes(m))) return 'submit';
  return 'generate';
}

export function normalizeSunoProxyBaseUrl(raw: string): {
  baseUrl: string;
  routeStyle: SunoApiRouteStyle;
} {
  let url = (raw || '').trim();
  const envStyle = process.env.SUNO_API_ROUTE_STYLE?.trim().toLowerCase();
  const envRoute: SunoApiRouteStyle | undefined =
    envStyle === 'sunoapi' ? 'sunoapi' : envStyle === 'suno' ? 'suno' : undefined;

  if (!url) return { baseUrl: '', routeStyle: envRoute ?? 'suno' };

  while (url.endsWith('/')) url = url.slice(0, -1);

  let routeStyle: SunoApiRouteStyle = envRoute ?? 'suno';

  try {
    const u = new URL(url);
    const parts = (u.pathname || '/').split('/').filter(Boolean);
    const last = parts[parts.length - 1]?.toLowerCase();
    if (last && ROUTE_SEGMENT.test(last)) {
      routeStyle = envRoute ?? (last.toLowerCase() as SunoApiRouteStyle);
      parts.pop();
      u.pathname = parts.length ? `/${parts.join('/')}` : '/';
      let out = u.toString();
      while (out.endsWith('/')) out = out.slice(0, -1);
      return { baseUrl: out, routeStyle };
    }
  } catch {
    const m = url.match(/\/(sunoapi|suno)\/?$/i);
    if (m) {
      routeStyle = envRoute ?? (m[1].toLowerCase() as SunoApiRouteStyle);
      url = url.slice(0, -m[0].length).replace(/\/+$/, '');
    }
  }

  return { baseUrl: url, routeStyle };
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** submit 风格路径映射（相对 suno/ 后的段） */
function mapEndpointForFlavor(ep: string, flavor: SunoApiFlavor): string {
  if (flavor !== 'submit') return ep;
  if (ep === 'generate') return 'submit/music';
  return ep;
}

/**
 * 将内部路径（如 /suno/generate、/suno/feed/ids）转为实际上游 URL。
 */
export function buildSunoUpstreamPath(
  proxyUrl: string,
  path: string,
): { url: string; routeStyle: SunoApiRouteStyle; flavor: SunoApiFlavor } {
  const flavor = resolveSunoApiFlavor(proxyUrl);
  const { baseUrl, routeStyle } = normalizeSunoProxyBaseUrl(proxyUrl);
  let ep = String(path || '')
    .trim()
    .replace(/^\/+/, '');
  ep = ep.replace(/^(sunoapi|suno)\//i, '');
  ep = mapEndpointForFlavor(ep, flavor);
  const upstreamPath = `/${routeStyle}/${ep}`;
  return { url: joinUrl(baseUrl, upstreamPath), routeStyle, flavor };
}

/** submit: POST /suno/submit/lyrics；generate: POST /suno/generate/lyrics/ */
export function lyricsSubmitUpstreamPath(flavor: SunoApiFlavor): string {
  return flavor === 'submit' ? '/suno/submit/lyrics' : '/suno/generate/lyrics/';
}

/** submit 与成曲相同用 fetch；generate 网关用 /suno/lyrics/{task_id} */
export function lyricsFetchUpstreamPath(flavor: SunoApiFlavor, taskId: string): string {
  const id = encodeURIComponent(taskId.trim());
  return flavor === 'submit' ? `/suno/fetch/${id}` : `/suno/lyrics/${id}`;
}

export function sunoSafeUrlForLog(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}
