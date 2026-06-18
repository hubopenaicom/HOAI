import type { SunoApiFlavor } from './suno-proxy.util';

/** submit 上游（ephone 等）将 vocal-stems/all-stems 转为 gen_stem */
export function adaptStemPayloadForSubmitFlavor(
  flavor: SunoApiFlavor,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (flavor !== 'submit') return payload;
  const task = String(payload.task || '').trim();
  if (task !== 'vocal-stems' && task !== 'all-stems') return payload;
  const clipId = String(payload.clip_id ?? payload.continue_clip_id ?? '').trim();
  if (!clipId) return payload;
  const allStems = task === 'all-stems';
  const out: Record<string, unknown> = {
    task: 'gen_stem',
    continue_clip_id: clipId,
    mv: payload.mv ?? 'chirp-fenix',
    make_instrumental: true,
    generation_type: 'TEXT',
    title: String(payload.title || (allStems ? 'All stems' : 'Vocal stems')),
    prompt: '',
    continued_aligned_prompt: null,
    continue_at: null,
    stem_type_id: 91,
    stem_type_group_name: allStems ? 'Twelve' : 'Two',
    stem_task: allStems ? 'twelve' : 'two',
  };
  if (payload.task_id) out.task_id = payload.task_id;
  return out;
}
