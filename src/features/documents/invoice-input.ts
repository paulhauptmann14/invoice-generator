import type { InvoiceRecordWithItems } from '@/features/invoices/draft'
import { parseIsoDate } from '@/lib/domain/dates'
import { priceSchema, quantitySchema, vatRateSchema } from '@/lib/domain/input-schemas'
import { discountSchema, invoiceDiscountIssue, itemDiscountIssue } from '@/features/invoices/schema'
import { discountFromColumns } from '@/lib/domain/totals'
import type { InvoiceInput, Recipient } from '@/lib/domain/view-model'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const orNull = (v: unknown) => (str(v).trim() === '' ? null : str(v).trim())
const record = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

function recipientFrom(raw: unknown): Recipient {
  const r = record(raw)
  return {
    name: str(r.name).trim(),
    contactPerson: orNull(r.contactPerson),
    street: str(r.street).trim(),
    postalCode: str(r.postalCode).trim(),
    city: str(r.city).trim(),
    countryCode: /^[A-Z]{2}$/.test(str(r.countryCode)) ? str(r.countryCode) : 'DE',
    vatId: orNull(r.vatId),
  }
}

export function inputFromInvoice(invoice: InvoiceRecordWithItems): InvoiceInput {
  return {
    number: invoice.number,
    issueDate: invoice.issue_date,
    serviceDateFrom: invoice.service_date_from,
    serviceDateTo: invoice.service_date_to,
    paymentDays: invoice.payment_days,
    recipient: recipientFrom(invoice.recipient),
    introText: invoice.intro_text,
    closingText: invoice.closing_text,
    discount: discountFromColumns(invoice.discount_kind, invoice.discount_value),
    items: [...invoice.invoice_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPriceGross: Number(i.unit_price_gross),
        vatRate: Number(i.vat_rate),
        discount: discountFromColumns(i.discount_kind, i.discount_value),
      })),
  }
}

function validDate(v: unknown, fallback: string): string {
  try {
    parseIsoDate(str(v))
    return str(v)
  } catch {
    return fallback
  }
}

/**
 * Best-effort input for the live preview: never throws. Lines are checked with the same
 * schemas as saving, so the preview only shows what would also be stored; others are skipped.
 */
export function inputFromPayload(payload: unknown, today: string): InvoiceInput {
  const p = record(payload)
  const issueDate = validDate(p.issueDate, today)
  const serviceDateFrom = validDate(p.serviceDateFrom, today)
  const serviceDateTo = p.serviceDateTo == null || p.serviceDateTo === '' ? null : validDate(p.serviceDateTo, serviceDateFrom)
  // Empty or not (yet) readable = no payment terms, so the preview never shows a made-up due date.
  const days = /^\d{1,3}$/.test(str(p.paymentDays).trim()) ? Math.min(Number(str(p.paymentDays).trim()), 365) : null
  const rawItems = Array.isArray(p.items) ? p.items : []
  const items = rawItems.flatMap((raw) => {
    const i = record(raw)
    const quantity = quantitySchema.safeParse(str(i.quantity))
    const price = priceSchema.safeParse(str(i.unitPriceGross))
    const rate = vatRateSchema.safeParse(str(i.vatRate))
    if (!quantity.success || !price.success || !rate.success) return []
    const line = { quantity: quantity.data, unitPriceGross: price.data, vatRate: rate.data }
    // A discount that could not be saved (unreadable, too high, on a non-positive line) is left out.
    const parsedDiscount = discountSchema.safeParse(i.discount)
    const discount = parsedDiscount.success && itemDiscountIssue({ ...line, discount: parsedDiscount.data }) === null ? parsedDiscount.data : null
    return [{ description: str(i.description), unit: str(i.unit), ...line, discount }]
  })
  const parsedInvoiceDiscount = discountSchema.safeParse(p.discount)
  const discount =
    parsedInvoiceDiscount.success && invoiceDiscountIssue(items, parsedInvoiceDiscount.data) === null ? parsedInvoiceDiscount.data : null
  return {
    number: str(p.number).trim(),
    issueDate,
    serviceDateFrom,
    serviceDateTo,
    paymentDays: days,
    recipient: recipientFrom(p.recipient),
    introText: str(p.introText),
    closingText: str(p.closingText),
    discount,
    items,
  }
}
