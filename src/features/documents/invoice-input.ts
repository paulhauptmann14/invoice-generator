import type { InvoiceRecordWithItems } from '@/features/invoices/draft'
import { parseIsoDate } from '@/lib/domain/dates'
import { priceSchema, quantitySchema, vatRateSchema } from '@/lib/domain/input-schemas'
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
    items: [...invoice.invoice_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
        unitPriceGross: Number(i.unit_price_gross),
        vatRate: Number(i.vat_rate),
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
  const days = /^\d{1,3}$/.test(str(p.paymentDays)) ? Math.min(Number(p.paymentDays), 365) : 0
  const rawItems = Array.isArray(p.items) ? p.items : []
  const items = rawItems.flatMap((raw) => {
    const i = record(raw)
    const quantity = quantitySchema.safeParse(str(i.quantity))
    const price = priceSchema.safeParse(str(i.unitPriceGross))
    const rate = vatRateSchema.safeParse(str(i.vatRate))
    if (!quantity.success || !price.success || !rate.success) return []
    return [{ description: str(i.description), quantity: quantity.data, unit: str(i.unit), unitPriceGross: price.data, vatRate: rate.data }]
  })
  return {
    number: str(p.number).trim(),
    issueDate,
    serviceDateFrom,
    serviceDateTo,
    paymentDays: days,
    recipient: recipientFrom(p.recipient),
    introText: str(p.introText),
    closingText: str(p.closingText),
    items,
  }
}
