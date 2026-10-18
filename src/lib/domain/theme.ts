import { z } from 'zod'

export const LAYOUTS = ['klassisch', 'briefpapier', 'modern', 'kompakt'] as const
export type Layout = (typeof LAYOUTS)[number]
/** Layouts that have a PDF + DOCX implementation and may be offered in the settings UI. */
export const IMPLEMENTED_LAYOUTS: readonly Layout[] = LAYOUTS
export const BUILTIN_FONTS = ['IBM Plex Sans', 'Inter', 'Lato', 'Open Sans', 'Source Serif 4', 'Merriweather'] as const

// Validation messages are user-facing (settings form) and therefore German.
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #RRGGBB angeben')
const mm = (min: number, max: number, def: number) => z.number().min(min).max(max).default(def)
const label = (def: string) => z.string().trim().max(30).default(def)

// Zod 4: nested objects need .prefault({}) (not .default({})) so their inner defaults are applied.
export const themeSchema = z.object({
  // "Briefpapier" mirrors the business's own Word invoice and is the default (2026-10-08).
  layout: z.enum(LAYOUTS).default('briefpapier'),
  page: z
    .object({
      marginTopMm: mm(5, 50, 15),
      marginRightMm: mm(5, 50, 20),
      marginBottomMm: mm(5, 50, 20),
      marginLeftMm: mm(5, 50, 25),
      din5008: z.enum(['A', 'B']).default('B'),
      senderLine: z.boolean().default(true),
    })
    .prefault({}),
  logo: z
    .object({
      path: z.string().nullable().default(null),
      position: z.enum(['links', 'mitte', 'rechts']).default('rechts'),
      widthMm: mm(10, 120, 45),
    })
    .prefault({}),
  // Invoice document colors are user data rendered into PDF/DOCX (no CSS variables there), so they are hex values.
  // Defaults follow the app palette (tinte, wash); the accent is only used by "Modern" and deliberately not red.
  colors: z
    .object({
      primary: hex.default('#17191C'),
      accent: hex.default('#1F5F74'),
      text: hex.default('#17191C'),
      tableHeaderBg: hex.default('#ECEEE9'),
      zebra: z.boolean().default(false),
    })
    .prefault({}),
  font: z
    .object({
      source: z.enum(['builtin', 'custom']).default('builtin'),
      builtin: z.enum(BUILTIN_FONTS).default('IBM Plex Sans'),
      customRegularPath: z.string().nullable().default(null),
      customBoldPath: z.string().nullable().default(null),
      baseSizePt: z.number().min(7).max(14).default(9.5),
      headingSizePt: z.number().min(10).max(28).default(16),
    })
    .prefault({}),
  table: z
    .object({
      showPosition: z.boolean().default(true),
      showUnit: z.boolean().default(true),
      showVatRate: z.boolean().default(true),
      labels: z
        .object({
          position: label('Pos.'),
          description: label('Beschreibung'),
          quantity: label('Menge'),
          unit: label('Einheit'),
          unitPrice: label('Einzelpreis'),
          vatRate: label('MwSt.'),
          total: label('Gesamt'),
        })
        .prefault({}),
    })
    .prefault({}),
  texts: z
    .object({
      title: z.string().trim().max(40).default('Rechnung'),
      // Defaults follow the business's own invoice: no intro or closing text.
      intro: z.string().max(2000).default(''),
      closing: z.string().max(2000).default(''),
      paymentNote: z
        .string()
        .max(1000)
        .default('Wir bitten höflich um Überweisung bis zum {Faellig} auf eines unserer nachfolgend genannten Konten:'),
      /** Used instead of paymentNote when the invoice has no payment days (and therefore no due date). */
      paymentNoteWithoutDueDate: z
        .string()
        .max(1000)
        .default('Wir bitten höflich um Überweisung auf eines unserer nachfolgend genannten Konten:'),
      /** "Briefpapier": note when the service date equals the invoice date; empty = no note. */
      serviceDateNoteSame: z.string().max(300).default('Leistungsdatum entspricht Rechnungsdatum.'),
      /** "Briefpapier": note for a different service date or period ({Leistungsdatum}); empty = no note. */
      serviceDateNoteOther: z.string().max(300).default('Leistungsdatum: {Leistungsdatum}'),
      /** Empty = footer is generated from the company data. */
      footerColumns: z.array(z.string().max(500)).max(4).default([]),
    })
    .prefault({}),
})

export type Theme = z.infer<typeof themeSchema>

/**
 * Fixed document details that are not user-configurable: hairlines, zebra tint, fold marks (app palette linie/papier/feld)
 * and muted small text in "Modern" (6:1 on white).
 */
export const DOCUMENT_COLORS = { rule: '#D5D9D3', zebra: '#F4F5F2', mark: '#868C86', muted: '#5F6368' } as const
export const defaultTheme: Theme = themeSchema.parse({})

const INK = '#17191C'
const WHITE = '#FFFFFF'

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Text color for a colored band (#RRGGBB): white or ink, whichever has the higher WCAG contrast. */
export function readableTextOn(background: string): string {
  const bg = luminance(background)
  return contrast(bg, luminance(WHITE)) >= contrast(bg, luminance(INK)) ? WHITE : INK
}

/** Lenient parse for stored data: falls back to defaults if the stored theme is invalid. */
export function parseTheme(raw: unknown): Theme {
  const result = themeSchema.safeParse(raw ?? {})
  return result.success ? result.data : defaultTheme
}
