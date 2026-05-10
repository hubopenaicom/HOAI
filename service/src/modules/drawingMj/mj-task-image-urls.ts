/** 与 chat 端 `collectMjImageUrls` 对齐，供后台列表缩略图展示 */
export function collectMjImageUrls(task: Record<string, unknown> | undefined): string[] {
  if (!task) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (u: unknown) => {
    if (typeof u !== 'string') return;
    const s = u.trim();
    if (!/^https?:\/\//i.test(s) || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  add(task.imageUrl);
  add(task.image_url);
  add(task.cdnImage);
  add(task.picUrl);
  add(task.pic_url);
  add(task.discordImageUrl);
  add(task.previewUrl);
  add(task.preview_url);
  add(task.thumbnailUrl);
  add(task.thumbnail_url);
  add(task.tempImageUrl);
  add(task.progressImageUrl);
  add(task.coverUrl);
  const props = task.properties as Record<string, unknown> | undefined;
  if (props) {
    add(props.imageUrl);
    add(props.image_url);
    add(props.cdnImage);
    add(props.previewUrl);
    add(props.preview_url);
    add(props.thumbnailUrl);
    add(props.thumbnail_url);
  }
  const list = task.imageUrls ?? task.image_urls ?? props?.imageUrls ?? props?.image_urls;
  if (Array.isArray(list)) list.forEach(add);
  return out;
}
