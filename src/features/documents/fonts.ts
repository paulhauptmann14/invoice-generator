import 'server-only'
import path from 'node:path'
import { Font } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import { resolveFontFamily } from './font-family'

// Built-in fonts come from @fontsource packages (latin + latin-ext subsets, 400 + 700); see outputFileTracingIncludes.
// Every entry of BUILTIN_FONTS needs a package here (covered by the renderer integration tests).
// The two subsets are registered as two families and used as a font stack (react-pdf falls back per glyph), so names
// like "Şahin Łukasz" or "Ćevapčići" (Polish, Czech, Turkish, Hungarian, Croatian, ...) render correctly.
const PACKAGE: Record<string, string> = {
  'IBM Plex Sans': 'ibm-plex-sans',
  Inter: 'inter',
  Lato: 'lato',
  'Open Sans': 'open-sans',
  'Source Serif 4': 'source-serif-4',
  Merriweather: 'merriweather',
}
const registered = new Set<string>()

// Invoices are business documents: never split words with hyphens.
Font.registerHyphenationCallback((word) => [word])

function file(pkg: string, subset: 'latin' | 'latin-ext', weight: 400 | 700) {
  return path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', `${pkg}-${subset}-${weight}-normal.woff`)
}

const extFamily = (family: string) => `${family} Ext`

// @fontsource's Lato (Google Fonts v1) lacks glyphs for several Central European letters (Č ř ů Ş ğ İ ő ű đ ...),
// even in latin-ext. Those fall back to Open Sans (closest humanist sans) instead of printing garbage.
const GLYPH_FALLBACK: Record<string, string> = { Lato: 'Open Sans' }

function register(family: string) {
  if (registered.has(family)) return
  const pkg = PACKAGE[family]
  const add = (name: string, subset: 'latin' | 'latin-ext') =>
    Font.register({ family: name, fonts: [{ src: file(pkg, subset, 400) }, { src: file(pkg, subset, 700), fontWeight: 700 }] })
  add(family, 'latin')
  add(extFamily(family), 'latin-ext')
  registered.add(family)
}

/**
 * Registers the theme's font once per process and returns the font stack for `fontFamily` styles: the latin subset
 * first, the latin-ext subset as per-glyph fallback (react-pdf picks the first font of the stack that has a glyph).
 * Custom fonts (M9) fall back for now.
 */
export function registerFonts(theme: Theme): string[] {
  const family = resolveFontFamily(theme)
  register(family)
  const fallback = GLYPH_FALLBACK[family]
  if (fallback) register(fallback)
  return [family, extFamily(family), ...(fallback ? [extFamily(fallback)] : [])]
}
