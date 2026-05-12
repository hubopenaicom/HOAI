/** 与绘画页垫图一致：降采样 + 压体积，避免 upload-discord-images 请求体过大 */
const MJ_REF_IMAGE_MAX_EDGE = 2048
const MJ_REF_JPEG_QUALITY = 0.88

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

/** 供 cref/sref/oref 上传：转为 Data URL 再 POST 到后端转 CDN https */
export async function fileToMjRefDataUrlForUpload(file: File): Promise<string> {
  try {
    const bmp = await createImageBitmap(file)
    try {
      let { width, height } = bmp
      const maxE = MJ_REF_IMAGE_MAX_EDGE
      if (width > maxE || height > maxE) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxE) / width))
          width = maxE
        } else {
          width = Math.max(1, Math.round((width * maxE) / height))
          height = maxE
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return fileToBase64(file)
      ctx.drawImage(bmp, 0, 0, width, height)
      const jpegish =
        file.type === 'image/jpeg' ||
        file.type === 'image/jpg' ||
        file.type === 'image/bmp' ||
        /\.(jpe?g|bmp)$/i.test(file.name)
      if (jpegish) return canvas.toDataURL('image/jpeg', MJ_REF_JPEG_QUALITY)
      return canvas.toDataURL('image/png')
    } finally {
      bmp.close()
    }
  } catch {
    return fileToBase64(file)
  }
}
