/** 从图片 URL 提取适合做下载文件名的主干（不含扩展名） */
export function safeImageFileStem(url: string, fallbackIndex: number): string {
  try {
    const u = new URL(
      url,
      typeof window !== 'undefined' ? window.location.href : 'https://invalid.invalid/'
    )
    const seg = u.pathname.split('/').filter(Boolean).pop() || ''
    const withoutExt = seg.replace(/\.[a-zA-Z0-9]{1,8}$/i, '')
    const cleaned = withoutExt
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 96)
    if (cleaned) return cleaned
  } catch {
    /* ignore */
  }
  return `image-${fallbackIndex + 1}`
}

function extFromMime(mime: string): string {
  if (!mime || !mime.startsWith('image/')) return ''
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/svg+xml') return 'svg'
  const sub = mime.slice(6)
  if (/^[a-z0-9]+$/i.test(sub)) return sub
  return ''
}

/** 下载文件名：stem + 扩展名（优先 blob MIME，其次 URL 路径） */
export function buildDownloadFileName(stem: string, url: string, blob?: Blob | null): string {
  let ext = ''
  if (blob?.type) ext = extFromMime(blob.type)
  if (!ext) {
    try {
      const path = url.split('?')[0] ?? url
      const m = path.match(/\.([a-zA-Z0-9]+)$/)
      ext = m ? m[1].toLowerCase() : 'png'
    } catch {
      ext = 'png'
    }
  }
  const safeStem = stem.replace(/\.(png|jpe?g|webp|gif|svg)$/i, '')
  return `${safeStem}.${ext}`
}
