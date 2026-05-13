/** 按每百万 token 单价估算费用（不参与实际扣费） */
export function computeTokenEstimateCost(params: {
  promptTokens: number;
  completionTokens: number;
  enabled: boolean;
  currency: string | null | undefined;
  inputPerMillion: number | null | undefined;
  outputPerMillion: number | null | undefined;
}): { amount: number; currency: string } | null {
  if (!params.enabled) return null;
  const inP = Number(params.inputPerMillion);
  const outP = Number(params.outputPerMillion);
  if (!Number.isFinite(inP) || !Number.isFinite(outP) || (inP <= 0 && outP <= 0)) return null;
  const pt = Math.max(0, Number(params.promptTokens) || 0);
  const ct = Math.max(0, Number(params.completionTokens) || 0);
  const amount = (pt / 1e6) * (inP > 0 ? inP : 0) + (ct / 1e6) * (outP > 0 ? outP : 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cur = String(params.currency || 'CNY')
    .trim()
    .toUpperCase();
  const safeCur = cur === 'USD' || cur === 'CNY' ? cur : 'CNY';
  return { amount: Math.round(amount * 1e6) / 1e6, currency: safeCur };
}
