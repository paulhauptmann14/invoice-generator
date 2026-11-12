import { z } from 'zod'
import { customerSchema } from '@/features/customers/schema'
import { parseIsoDate } from '@/lib/domain/dates'
import { parseGermanDecimal } from '@/lib/domain/decimal'
import { optionalQuantitySchema, priceSchema, vatRateSchema } from '@/lib/domain/input-schemas'
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

/**
 * Why the invoice discount cannot be applied to these lines (item discounts included); null = fine.
 * Negative line amounts block it, and so does a discount above the subtotal (a percent discount on a
 * zero subtotal is 0 and fine; a fixed amount on a zero subtotal is not).
 */
export function invoiceDiscountIssue(lines: LineInput[], discount: Discount): string | null {
  if (!discount) return null
  const totals = calcTotals(lines, discount)
  if (totals.lineTotalsCents.some((cents) => cents < 0)) return INVOICE_DISCOUNT_BLOCKED_BY_NEGATIVE
  if (totals.invoiceDiscountCents > totals.subtotalCents) return 'Der Rabatt ist höher als die Zwischensumme.'
  return null
}

export const CUSTOMER_SEQ_MAX = 99999

// The optional counter in the file name: empty = automatic (null), otherwise an integer from 1 to 99999.
const customerSeqSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return null
    if (/^\d{1,5}$/.test(v)) {
      const n = Number(v)
      if (n >= 1 && n <= CUSTOMER_SEQ_MAX) return n
    }
    ctx.addIssue({ code: 'custom', message: `Bitte eine ganze Zahl von 1 bis ${CUSTOMER_SEQ_MAX} eingeben oder das Feld leer lassen.` })
    return z.NEVER
  })
  .optional()
  .transform((v) => v ?? null)

/** Input of the duplicate lookup for the counter field (nothing is stored). */
export const customerSeqCheckSchema = z.object({
  customerId: z.uuid().nullable(),
  saveAsCustomer: z.boolean(),
  recipientName: z.string().max(200),
  numberRangeId: z.uuid().nullable(),
  customerSeq: customerSeqSchema,
  excludeInvoiceId: z.uuid().nullable(),
})

export const invoiceItemSchema = z.object({
  kind: z.literal('item'),
  description: z.string().trim().min(1, 'Bitte eine Beschreibung eingeben.').max(1000, 'Höchstens 1000 Zeichen.'),
  // Empty = no quantity: a plain amount, printed without quantity, unit and unit price.
  quantity: optionalQuantitySchema,
  unit: z.string().trim().max(20, 'Höchstens 20 Zeichen.'),
  unitPriceGross: priceSchema,
  vatRate: vatRateSchema,
  articleId: z.uuid().nullable(),
  saveAsArticle: z.boolean(),
  discount: discountSchema.nullable().default(null),
})

/** A heading between the items (e.g. "KW 41"): text only. */
export const invoiceHeadingSchema = z.object({
  kind: z.literal('heading'),
  description: z.string().trim().min(1, 'Bitte eine Überschrift eingeben oder die Zeile entfernen.').max(200, 'Höchstens 200 Zeichen.'),
})

// A line without "kind" is an item. Discriminated, so errors keep the path of the field that failed.
const invoiceLineSchema = z.preprocess(
  (line) => (line !== null && typeof line === 'object' && !('kind' in line) ? { ...line, kind: 'item' } : line),
  z.discriminatedUnion('kind', [invoiceItemSchema, invoiceHeadingSchema]),
)

export const invoiceSchema = z
  .object({
    // null = manual number; the database checks that the range belongs to the same business.
    numberRangeId: z.uuid().nullable().default(null),
    // null = draft: the number is given later from the number range.
    number: z.string().trim().min(1, 'Bitte eine Rechnungsnummer eingeben.').max(50, 'Höchstens 50 Zeichen.').nullable(),
    customerId: z.uuid().nullable(),
    customerSeq: customerSeqSchema,
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
    items: z
      .array(invoiceLineSchema)
      .min(1, 'Bitte mindestens eine Position hinzufügen.')
      .max(200, 'Höchstens 200 Positionen.')
      // A unit means nothing without a quantity (and would not be printed).
      .transform((lines) => lines.map((line) => (line.kind === 'item' && line.quantity === null ? { ...line, unit: '' } : line))),
  })
  .refine((d) => d.number !== null || d.numberRangeId !== null, {
    path: ['number'],
    message: 'Eine Nummer später vergeben geht nur mit einem Nummernkreis (Einstellungen → Nummern & Dateien).',
  })
  .refine((d) => !d.serviceDateTo || d.serviceDateTo >= d.serviceDateFrom, {
    path: ['serviceDateTo'],
    message: 'Das Ende darf nicht vor dem Beginn liegen.',
  })
  .superRefine((d, ctx) => {
    // Headings alone are no invoice.
    if (!d.items.some((line) => line.kind === 'item')) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Bitte mindestens eine Position hinzufügen.' })
      return
    }
    // Amount limits and the positive-amount rule; all arithmetic lives in the totals module.
    const lines: LineInput[] = []
    let itemDiscountFailed = false
    d.items.forEach((item, index) => {
      if (item.kind !== 'item') return
      const line = { quantity: item.quantity, unitPriceGross: item.unitPriceGross, vatRate: item.vatRate, discount: item.discount }
      lines.push(line)
      const message = itemDiscountIssue(line)
      if (message === null) return
      itemDiscountFailed = true
      // The index into all lines, headings included, so the message shows at the right position.
      ctx.addIssue({ code: 'custom', path: ['items', index, 'discount'], message })
    })
    // The line totals are meaningless while an item discount is rejected: report that one first.
    if (itemDiscountFailed) return
    const message = invoiceDiscountIssue(lines, d.discount)
    if (message !== null) ctx.addIssue({ code: 'custom', path: ['discount'], message })
  })

export type InvoiceSubmission = z.output<typeof invoiceSchema>
