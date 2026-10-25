import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { parseTheme, type Theme } from '@/lib/domain/theme'
import { calcTotals, discountFromColumns } from '@/lib/domain/totals'
import { escapeLike, normalizeSearch } from '@/lib/search'
import type { InvoiceRecordWithItems, NumberRangeChoice, PickerArticle, PickerCustomer } from './draft'

type Client = SupabaseClient<Database>
export const LIST_LIMIT = 500

export type InvoiceListRow = {
  id: string
  number: string
  issueDate: string
  /** null = invoice without payment terms. */
  dueDate: string | null
  recipientName: string
  grossCents: number
}

export async function listInvoices(supabase: Client, tenantId: string, opts: { q: string }): Promise<InvoiceListRow[]> {
  let query = supabase
    .from('invoices')
    .select('id, number, issue_date, due_date, recipient, discount_kind, discount_value, invoice_items(quantity, unit_price_gross, vat_rate, discount_kind, discount_value)')
    .eq('tenant_id', tenantId)
    .order('issue_date', { ascending: false })
    .order('number', { ascending: false })
    .limit(LIST_LIMIT)
  const term = normalizeSearch(opts.q)
  if (term) query = query.ilike('search_text', `%${escapeLike(term)}%`)

  const { data, error } = await query
  if (error) throw new Error(`Loading invoices failed: ${error.message}`)
  return data.map((row) => {
    const recipient = (row.recipient ?? {}) as { name?: unknown }
    const totals = calcTotals(
      row.invoice_items.map((i) => ({
        quantity: i.quantity,
        unitPriceGross: i.unit_price_gross,
        vatRate: i.vat_rate,
        discount: discountFromColumns(i.discount_kind, i.discount_value),
      })),
      discountFromColumns(row.discount_kind, row.discount_value),
    )
    return {
      id: row.id,
      number: row.number,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      recipientName: typeof recipient.name === 'string' ? recipient.name : '',
      grossCents: totals.grossCents,
    }
  })
}

export async function getInvoice(
  supabase: Client,
  tenantId: string,
  id: string,
): Promise<(InvoiceRecordWithItems & { id: string; updated_at: string }) | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, updated_at, number, number_range_id, customer_id, customer_seq, recipient, issue_date, service_date_from, service_date_to, payment_days, intro_text, closing_text, discount_kind, discount_value, invoice_items(id, position, description, quantity, unit, unit_price_gross, vat_rate, article_id, discount_kind, discount_value)',
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .order('position', { referencedTable: 'invoice_items' })
    .maybeSingle()
  if (error) throw new Error(`Loading invoice failed: ${error.message}`)
  return data
}

/** PostgREST returns at most 1000 rows per request (its default max-rows). */
const NUMBER_PAGE_SIZE = 1000

/**
 * Every invoice number of the tenant, read page by page: the next-number suggestion must see all of
 * them, and a single request is capped. Ordered by id so pages never overlap or skip rows.
 * `pageSize` is a parameter for tests only.
 */
export async function listInvoiceNumbers(supabase: Client, tenantId: string, pageSize = NUMBER_PAGE_SIZE): Promise<string[]> {
  const numbers: string[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('invoices')
      .select('number')
      .eq('tenant_id', tenantId)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Loading invoice numbers failed: ${error.message}`)
    numbers.push(...data.map((r) => r.number))
    if (data.length < pageSize) return numbers
  }
}

export async function getInvoiceSettings(
  supabase: Client,
  tenantId: string,
): Promise<{ defaultPaymentDays: number | null; theme: Theme }> {
  const { data, error } = await supabase.from('settings').select('default_payment_days, theme').eq('tenant_id', tenantId).single()
  if (error) throw new Error(`Loading settings failed: ${error.message}`)
  return { defaultPaymentDays: data.default_payment_days, theme: parseTheme(data.theme) }
}

/** All number ranges of the tenant (archived ones too, for invoices that still use them): default first, then by name. */
export async function listNumberRanges(supabase: Client, tenantId: string): Promise<NumberRangeChoice[]> {
  const { data, error } = await supabase
    .from('number_ranges')
    .select('id, name, format, is_default, archived_at')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('name')
  if (error) throw new Error(`Loading number ranges failed: ${error.message}`)
  return data.map((r) => ({ id: r.id, name: r.name, format: r.format, isDefault: r.is_default, archived: r.archived_at !== null }))
}

export async function listCustomerChoices(supabase: Client, tenantId: string): Promise<PickerCustomer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, contact_person, street, postal_code, city, country_code, vat_id')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('name')
    .limit(LIST_LIMIT)
  if (error) throw new Error(`Loading customers failed: ${error.message}`)
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    contactPerson: c.contact_person,
    street: c.street,
    postalCode: c.postal_code,
    city: c.city,
    countryCode: c.country_code,
    vatId: c.vat_id,
  }))
}

export async function listArticleChoices(supabase: Client, tenantId: string): Promise<PickerArticle[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, name, description, unit, unit_price_gross, vat_rate')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('name')
    .limit(LIST_LIMIT)
  if (error) throw new Error(`Loading articles failed: ${error.message}`)
  return data.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    unit: a.unit,
    unitPriceGross: a.unit_price_gross,
    vatRate: a.vat_rate,
  }))
}

/** Same normalization as private.customer_key for free-text recipients: trimmed, whitespace collapsed, lower case. */
export function normalizeRecipientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Number of another invoice of the same business, number range (null = none) and customer that already uses the
 * given counter; null when the counter is free. The customer is the customer record, or without one the recipient
 * name (only compared with invoices that have no customer record either).
 */
export async function findInvoiceWithCustomerSeq(
  supabase: Client,
  tenantId: string,
  opts: { customerId: string | null; recipientName: string; numberRangeId: string | null; customerSeq: number; excludeInvoiceId: string | null },
): Promise<string | null> {
  let query = supabase
    .from('invoices')
    .select('number, recipient')
    .eq('tenant_id', tenantId)
    .eq('customer_seq', opts.customerSeq)
    .order('number')
    .limit(100)
  query = opts.numberRangeId === null ? query.is('number_range_id', null) : query.eq('number_range_id', opts.numberRangeId)
  query = opts.customerId === null ? query.is('customer_id', null) : query.eq('customer_id', opts.customerId)
  if (opts.excludeInvoiceId !== null) query = query.neq('id', opts.excludeInvoiceId)

  const { data, error } = await query
  if (error) throw new Error(`Checking the customer counter failed: ${error.message}`)
  if (opts.customerId !== null) return data[0]?.number ?? null
  const wanted = normalizeRecipientName(opts.recipientName)
  const match = data.find((row) => {
    const name = (row.recipient as { name?: unknown } | null)?.name
    return typeof name === 'string' && normalizeRecipientName(name) === wanted
  })
  return match?.number ?? null
}
