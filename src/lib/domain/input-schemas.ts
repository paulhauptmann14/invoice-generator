import { z } from 'zod'
import { parseGermanDecimal } from './decimal'

export const VAT_RATES = [19, 7, 0] as const
export type VatRate = (typeof VAT_RATES)[number]

type DecimalRules = { decimals: number; max: number; invalid: string; tooPrecise: string; tooLarge: string; zero?: string }

// User-typed German decimals -> number, with German messages for the form.
function decimalField(rules: DecimalRules) {
  return z.string().transform((value, ctx) => {
    const n = parseGermanDecimal(value)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: rules.invalid })
      return z.NEVER
    }
    const scale = 10 ** rules.decimals
    if (Math.abs(Math.round(n * scale) - n * scale) > 1e-6) {
      ctx.addIssue({ code: 'custom', message: rules.tooPrecise })
      return z.NEVER
    }
    if (Math.abs(n) > rules.max) {
      ctx.addIssue({ code: 'custom', message: rules.tooLarge })
      return z.NEVER
    }
    if (rules.zero && n === 0) {
      ctx.addIssue({ code: 'custom', message: rules.zero })
      return z.NEVER
    }
    return n
  })
}

export const priceSchema = decimalField({
  decimals: 2,
  max: 999_999.99,
  invalid: 'Bitte einen Preis wie 24,90 eingeben.',
  tooPrecise: 'Höchstens zwei Nachkommastellen.',
  tooLarge: 'Der Preis ist zu hoch.',
})

export const quantitySchema = decimalField({
  decimals: 3,
  max: 99_999.999,
  invalid: 'Bitte eine Menge wie 1 oder 0,5 eingeben.',
  tooPrecise: 'Höchstens drei Nachkommastellen.',
  tooLarge: 'Die Menge ist zu groß.',
  zero: 'Die Menge darf nicht 0 sein.',
})

export const vatRateSchema = z
  .string()
  .transform(Number)
  .refine((v): v is VatRate => (VAT_RATES as readonly number[]).includes(v), 'Bitte einen Steuersatz auswählen.')
