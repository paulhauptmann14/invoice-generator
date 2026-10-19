import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { calcTotals, discountFromColumns } from '@/lib/domain/totals'
import { type InvoiceRecordWithItems, SMALL_INVOICE_LIMIT_CENTS } from './draft'
import { getInvoice } from './queries'
import { recipientAddressMessage } from './recipient-address-message'

const FIELDS = [
  ['street', 'Straße'],
  ['postalCode', 'PLZ'],
  ['city', 'Ort'],
] as const

/** Gross total of a saved invoice (after item and invoice discounts). */
export function invoiceGrossCents(invoice: InvoiceRecordWithItems): number {
  return calcTotals(
    invoice.invoice_items.map((i) => ({
      quantity: i.quantity,
      unitPriceGross: i.unit_price_gross,
      vatRate: i.vat_rate,
      discount: discountFromColumns(i.discount_kind, i.discount_value),
    })),
    discountFromColumns(invoice.discount_kind, invoice.discount_value),
  ).grossCents
}

/**
 * § 14 UStG: above 250 EUR gross the recipient's full address is mandatory (small-amount invoices are
 * exempt). Returns the German names of the empty address fields; [] = export allowed. The magnitude counts,
 * so credit notes are held to the same limit.
 */
export function missingRecipientAddress(recipient: unknown, grossCents: number): string[] {
  if (Math.abs(grossCents) <= SMALL_INVOICE_LIMIT_CENTS) return []
  const r = recipient && typeof recipient === 'object' ? (recipient as Record<string, unknown>) : {}
  return FIELDS.filter(([key]) => typeof r[key] !== 'string' || r[key].trim() === '').map(([, label]) => label)
}

/** Missing address fields of a saved invoice (see missingRecipientAddress). */
export function missingRecipientAddressOf(invoice: InvoiceRecordWithItems): string[] {
  return missingRecipientAddress(invoice.recipient, invoiceGrossCents(invoice))
}

/** For the export routes: loads the saved invoice (tenant-filtered) and returns its missing address fields; [] if it does not exist. */
export async function loadMissingRecipientAddress(supabase: SupabaseClient<Database>, tenantId: string, id: string): Promise<string[]> {
  const invoice = await getInvoice(supabase, tenantId, id)
  return invoice ? missingRecipientAddressOf(invoice) : []
}

export { recipientAddressMessage }
