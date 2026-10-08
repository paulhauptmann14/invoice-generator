import { BUILTIN_FONTS, type Theme } from '@/lib/domain/theme'

export const FALLBACK_FONT = 'IBM Plex Sans'

/** Font family for both renderers (PDF, DOCX). Custom uploaded fonts arrive in M9; until then they fall back. */
export function resolveFontFamily(theme: Theme): string {
  const font = theme.font
  return font.source === 'builtin' && (BUILTIN_FONTS as readonly string[]).includes(font.builtin) ? font.builtin : FALLBACK_FONT
}
