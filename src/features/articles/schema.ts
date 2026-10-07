import { z } from 'zod'
import { priceSchema, vatRateSchema } from '@/lib/domain/input-schemas'

export { VAT_RATES } from '@/lib/domain/input-schemas'

export const ARTICLE_FIELDS = ['name', 'description', 'unit', 'unitPriceGross', 'vatRate'] as const
export type ArticleField = (typeof ARTICLE_FIELDS)[number]

// Messages are shown next to form fields (German UI).
export const articleSchema = z.object({
  name: z.string().trim().min(1, 'Bitte eine Bezeichnung eingeben.').max(200, 'Höchstens 200 Zeichen.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Höchstens 1000 Zeichen.')
    .transform((v) => (v === '' ? null : v)),
  unit: z.string().trim().max(20, 'Höchstens 20 Zeichen.'),
  unitPriceGross: priceSchema,
  vatRate: vatRateSchema,
})

export type ArticleInput = z.output<typeof articleSchema>
