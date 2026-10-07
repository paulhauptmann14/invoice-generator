import { z } from 'zod'

export const LAYOUTS = ['klassisch', 'modern', 'kompakt'] as const
export type Layout = (typeof LAYOUTS)[number]
/** Layouts that have a PDF + DOCX implementation and may be offered in the settings UI. */
export const IMPLEMENTED_LAYOUTS: readonly Layout[] = ['klassisch']
export const BUILTIN_FONTS = ['Inter', 'Lato', 'Open Sans', 'Source Serif 4', 'Merriweather'] as const

// Validation messages are user-facing (settings form) and therefore German.
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #RRGGBB angeben')
const mm = (min: number, max: number, def: number) => z.number().min(min).max(max).default(def)
const label = (def: string) => z.string().trim().max(30).default(def)

// Zod 4: nested objects need .prefault({}) (not .default({})) so their inner defaults are applied.
export const themeSchema = z.object({
  layout: z.enum(LAYOUTS).default('klassisch'),
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
  // Defaults follow the app palette: tinte, stempel, tinte, wash.
  colors: z
    .object({
      primary: hex.default('#17191C'),
      accent: hex.default('#B3261E'),
      text: hex.default('#17191C'),
      tableHeaderBg: hex.default('#ECEEE9'),
      zebra: z.boolean().default(false),
    })
    .prefault({}),
  font: z
    .object({
      source: z.enum(['builtin', 'custom']).default('builtin'),
      builtin: z.enum(BUILTIN_FONTS).default('Inter'),
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
      intro: z.string().max(2000).default('Vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:'),
      closing: z.string().max(2000).default('Wir freuen uns auf Ihren nächsten Besuch.'),
      paymentNote: z
        .string()
        .max(1000)
        .default('Bitte überweisen Sie den Betrag von {Betrag} bis zum {Faellig} unter Angabe der Rechnungsnummer {Nr}.'),
      /** Empty = footer is generated from the company data. */
      footerColumns: z.array(z.string().max(500)).max(4).default([]),
    })
    .prefault({}),
})

export type Theme = z.infer<typeof themeSchema>
export const defaultTheme: Theme = themeSchema.parse({})

/** Lenient parse for stored data: falls back to defaults if the stored theme is invalid. */
export function parseTheme(raw: unknown): Theme {
  const result = themeSchema.safeParse(raw ?? {})
  return result.success ? result.data : defaultTheme
}
