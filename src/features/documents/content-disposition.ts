import { toAsciiFilename } from '@/lib/domain/filename'

/** RFC 6266 / 5987 header: `filename*` carries the readable UTF-8 name, `filename` an ASCII-only fallback. */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${type}; filename="${toAsciiFilename(filename)}"; filename*=UTF-8''${encoded}`
}
