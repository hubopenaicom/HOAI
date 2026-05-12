/**
 * 通过 `MJ_PROXY_HOST_MARKERS` 配置 Midjourney 代理 URL（`proxyUrl`）子串列表，
 * 用于在未单独指定各开关时，对特定上游启用一组兼容逻辑（见各调用处注释）。
 * 逗号或分号分隔，忽略空项，匹配时不区分大小写（子串包含即可）。
 */
function parseMjProxyHostMarkers(env: NodeJS.ProcessEnv): string[] {
  const raw = env.MJ_PROXY_HOST_MARKERS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

/** `proxyUrl` 是否包含 `MJ_PROXY_HOST_MARKERS` 中任一段（未配置任何段时恒为 false） */
export function proxyUrlMatchesMjHostMarkers(
  proxyUrl: string | undefined | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const markers = parseMjProxyHostMarkers(env);
  if (!markers.length) return false;
  const u = String(proxyUrl || '').toLowerCase();
  if (!u) return false;
  return markers.some(m => u.includes(m));
}
