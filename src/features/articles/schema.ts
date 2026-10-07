import { z } from 'zod'
import { parseGermanDecimal } from '@/lib/domain/decimal'

export const VAT_RATES = [19, 7, 0] as const
export const ARTICLE_FIELDS = ['name', 'description', 'unit', 'unitPriceGross', 'vatRate'] as const
export type ArticleField = (typeof ARTICLE_FIELDS)[number]

const MAX_PRICE = 999_999.99

// Messages are shown next to form fields (German UI).
export const articleSchema = z.object({
  name: z.string().trim().min(1, 'Bitte eine Bezeichnung eingeben.').max(200, 'Höchstens 200 Zeichen.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Höchstens 1000 Zeichen.')
    .transform((v) => (v === '' ? null : v)),
  unit: z.string().trim().max(20, 'Höchstens 20 Zeichen.'),
  unitPriceGross: z.string().transform((v, ctx) => {
    const n = parseGermanDecimal(v)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: 'Bitte einen Preis wie 24,90 eingeben.' })
      return z.NEVER
    }
    if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) {
      ctx.addIssue({ code: 'custom', message: 'Höchstens zwei Nachkommastellen.' })
      return z.NEVER
    }
    if (Math.abs(n) > MAX_PRICE) {
      ctx.addIssue({ code: 'custom', message: 'Der Preis ist zu hoch.' })
      return z.NEVER
    }
    return n
  }),
  vatRate: z
    .string()
    .transform(Number)
    .refine(
      (v): v is (typeof VAT_RATES)[number] => (VAT_RATES as readonly number[]).includes(v),
      'Bitte einen Steuersatz auswählen.',
    ),
})

export type ArticleInput = z.output<typeof articleSchema>
