import { z } from 'zod'
import { customerSchema } from '@/features/customers/schema'
import { parseIsoDate } from '@/lib/domain/dates'
import { parseGermanDecimal } from '@/lib/domain/decimal'
import { priceSchema, quantitySchema, vatRateSchema } from '@/lib/domain/input-schemas'
import { calcLineGrossCents, calcLineTotalCents, calcTotals, type Discount, type LineInput } from '@/lib/domain/totals'

// Messages are shown in the invoice form (German UI).
const isoDate = (message: string) =>
  z.string().refine((v) => {
    try {
      parseIsoDate(v)
      return true
    } catch {
      return false
    }
  }, message)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((v) => (v === '' ? null : v))

export const recipientSchema = customerSchema.pick({
  name: true,
  contactPerson: true,
  street: true,
  postalCode: true,
  city: true,
  countryCode: true,
  vatId: true,
})

const DISCOUNT_PERCENT_MESSAGE = 'Rabatt: 0,01 bis 100 %.'
const ITEM_DISCOUNT_NEEDS_POSITIVE = 'Ein Rabatt ist nur bei Positionen mit positivem Betrag möglich.'
const INVOICE_DISCOUNT_BLOCKED_BY_NEGATIVE = 'Ein Rabatt auf die Rechnung ist nur möglich, wenn keine Position einen negativen Betrag hat.'

// A discount as typed in the form (kind + value text) -> { kind, value: number }. Issues sit on the
// discount itself, so the form shows them under the discount fields. Limits that depend on the
// amount they apply to (item amount, subtotal) are checked in invoiceSchema.
export const discountSchema = z
  .object({ kind: z.enum(['percent', 'amount']), value: z.string() })
  .transform((discount, ctx) => {
    const fail = (message: string) => {
      ctx.addIssue({ code: 'custom', message })
      return z.NEVER
    }
    if (discount.value.trim() === '') return fail('Bitte einen Rabatt eingeben oder den Rabatt entfernen.')
    const n = parseGermanDecimal(discount.value)
    if (n === null) return fail(discount.kind === 'percent' ? DISCOUNT_PERCENT_MESSAGE : 'Bitte einen Rabatt wie 10 oder 12,5 eingeben.')
    if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return fail('Höchstens zwei Nachkommastellen.')
    if (discount.kind === 'percent') {
      if (n < 0.01 || n > 100) return fail(DISCOUNT_PERCENT_MESSAGE)
    } else {
      if (n <= 0) return fail('Der Rabatt muss größer als 0 sein.')
      if (n > 999_999.99) return fail('Der Rabatt ist zu hoch.')
    }
    return { kind: discount.kind, value: n }
  })

/** Why the line's own discount cannot be applied to the line; null = fine (or no discount). */
export function itemDiscountIssue(line: LineInput): string | null {
  if (!line.discount) return null
  if (calcLineGrossCents(line) <= 0) return ITEM_DISCOUNT_NEEDS_POSITIVE
  if (calcLineTotalCents(line) < 0) return 'Der Rabatt ist höher als der Betrag der Position.'
  return null
}

/** Why the invoice discount cannot be applied to these lines (item discounts included); null = fine. Only negative line amounts block it. */
export function invoiceDiscountIssue(lines: LineInput[], discount: Discount): string | null {
  if (!discount) return null
  const totals = calcTotals(lines, discount)
  if (totals.lineTotalsCents.some((cents) => cents < 0)) return INVOICE_DISCOUNT_BLOCKED_BY_NEGATIVE
  if (totals.grossCents < 0) return 'Der Rabatt ist höher als die Zwischensumme.'
  return null
}

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Bitte eine Beschreibung eingeben.').max(1000, 'Höchstens 1000 Zeichen.'),
  quantity: quantitySchema,
  unit: z.string().trim().max(20, 'Höchstens 20 Zeichen.'),
  unitPriceGross: priceSchema,
  vatRate: vatRateSchema,
  articleId: z.uuid().nullable(),
  saveAsArticle: z.boolean(),
  discount: discountSchema.nullable().default(null),
})

export const invoiceSchema = z
  .object({
    // null = manual number; the database checks that the range belongs to the same business.
    numberRangeId: z.uuid().nullable().default(null),
    number: z.string().trim().min(1, 'Bitte eine Rechnungsnummer eingeben.').max(50, 'Höchstens 50 Zeichen.'),
    customerId: z.uuid().nullable(),
    saveAsCustomer: z.boolean(),
    recipient: recipientSchema,
    issueDate: isoDate('Bitte ein gültiges Rechnungsdatum wählen.'),
    serviceDateFrom: isoDate('Bitte ein gültiges Leistungsdatum wählen.'),
    serviceDateTo: isoDate('Bitte ein gültiges Enddatum wählen.').nullable(),
    // Optional: empty = no payment terms, the invoice then shows no due date.
    paymentDays: z
      .string()
      .trim()
      .regex(/^(\d{1,3})?$/, 'Bitte 0 bis 365 Tage eingeben.')
      .transform((v) => (v === '' ? null : Number(v)))
      .refine((n) => n === null || n <= 365, 'Bitte 0 bis 365 Tage eingeben.'),
    introText: optionalText(2000),
    closingText: optionalText(2000),
    discount: discountSchema.nullable().default(null),
    items: z.array(invoiceItemSchema).min(1, 'Bitte mindestens eine Position hinzufügen.').max(200, 'Höchstens 200 Positionen.'),
  })
  .refine((d) => !d.serviceDateTo || d.serviceDateTo >= d.serviceDateFrom, {
    path: ['serviceDateTo'],
    message: 'Das Ende darf nicht vor dem Beginn liegen.',
  })
  .superRefine((d, ctx) => {
    // Amount limits and the positive-amount rule; all arithmetic lives in the totals module.
    const lines = d.items.map((i) => ({ quantity: i.quantity, unitPriceGross: i.unitPriceGross, vatRate: i.vatRate, discount: i.discount }))
    let itemDiscountFailed = false
    lines.forEach((line, index) => {
      const message = itemDiscountIssue(line)
      if (message === null) return
      itemDiscountFailed = true
      ctx.addIssue({ code: 'custom', path: ['items', index, 'discount'], message })
    })
    // The line totals are meaningless while an item discount is rejected: report that one first.
    if (itemDiscountFailed) return
    const message = invoiceDiscountIssue(lines, d.discount)
    if (message !== null) ctx.addIssue({ code: 'custom', path: ['discount'], message })
  })

export type InvoiceSubmission = z.output<typeof invoiceSchema>
