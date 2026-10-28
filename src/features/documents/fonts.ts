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
function registerFonts(theme: Theme): string[] {
  const family = resolveFontFamily(theme)
  register(family)
  const fallback = GLYPH_FALLBACK[family]
  if (fallback) register(fallback)
  return [family, extFamily(family), ...(fallback ? [extFamily(fallback)] : [])]
}

// The part of a fontkit font used here (react-pdf does not export fontkit's types).
type GlyphLookup = {
  characterSet: number[]
  glyphForCodePoint: (codePoint: number) => { codePoints: number[] }
  hasGlyphForCodePoint: (codePoint: number) => boolean
}
const primed = new WeakSet<object>()

/**
 * fontkit keeps one glyph object per glyph for the life of the process, with the code points of its first lookup, and
 * the PDF's Unicode map is built from them. Embedding a composite glyph (the "Ü" of "Überweisung" is drawn from "U"
 * and "¨") looks its components up without code points; from then on every "U" in every PDF had no Unicode mapping,
 * so Firefox's viewer dropped it and copied text lost it. Looking every character up once before the first layout
 * gives each glyph its own code point (and repairs one cached without).
 */
function primeGlyphs(font: GlyphLookup) {
  if (primed.has(font)) return
  for (const codePoint of font.characterSet) {
    const glyph = font.glyphForCodePoint(codePoint)
    if (glyph.codePoints.length === 0) glyph.codePoints = [codePoint]
  }
  primed.add(font)
}

const LINE_BREAKS = new Set([0x0a, 0x0d])

/**
 * react-pdf sets every character its font stack lacks in Helvetica, its built-in fallback, which is never embedded.
 * Line breaks ("\n" in footer columns and texts) are such characters, although nothing is drawn for them, so every
 * PDF referenced a non-embedded Helvetica, which PDF/A (the ZUGFeRD invoice) forbids. The theme font takes line
 * breaks instead; the pages look exactly the same.
 */
function claimLineBreaks(font: GlyphLookup) {
  const has = font.hasGlyphForCodePoint.bind(font)
  font.hasGlyphForCodePoint = (codePoint) => LINE_BREAKS.has(codePoint) || has(codePoint)
}

/** Registers and loads the theme's fonts for rendering; returns the font stack (see `registerFonts`). */
export async function prepareFonts(theme: Theme): Promise<string[]> {
  const stack = registerFonts(theme)
  await Promise.all(
    stack.flatMap((fontFamily) =>
      ([400, 700] as const).map(async (fontWeight) => {
        await Font.load({ fontFamily, fontWeight })
        const data = Font.getFont({ fontFamily, fontWeight }).data as GlyphLookup | null
        if (data && !primed.has(data)) {
          primeGlyphs(data)
          claimLineBreaks(data)
        }
      }),
    ),
  )
  return stack
}
