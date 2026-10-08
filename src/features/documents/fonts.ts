import 'server-only'
import path from 'node:path'
import { Font } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import { resolveFontFamily } from './font-family'

// Built-in fonts come from @fontsource packages (latin subset, 400 + 700); see outputFileTracingIncludes.
// Every entry of BUILTIN_FONTS needs a package here (covered by the renderer integration tests).
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

function file(pkg: string, weight: 400 | 700) {
  return path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', `${pkg}-latin-${weight}-normal.woff`)
}

/** Registers the theme's font once per process and returns its family name. Custom fonts (M9) fall back for now. */
export function registerFonts(theme: Theme): string {
  const family = resolveFontFamily(theme)
  if (!registered.has(family)) {
    const pkg = PACKAGE[family]
    Font.register({ family, fonts: [{ src: file(pkg, 400) }, { src: file(pkg, 700), fontWeight: 700 }] })
    registered.add(family)
  }
  return family
}
