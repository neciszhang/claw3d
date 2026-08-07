export function detectWebGL(): { ok: boolean; reason?: 'noWebgl' | 'initFail' } {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return { ok: false, reason: 'noWebgl' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'initFail' }
  }
}

let webpCache: boolean | null = null
export function supportsWebP(): boolean {
  if (webpCache != null) return webpCache
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpCache = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpCache = false
  }
  return webpCache
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
