import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { parseTheme, type Theme } from '@/lib/domain/theme'
import { calcTotals } from '@/lib/domain/totals'
import { escapeLike, normalizeSearch } from '@/lib/search'
import type { InvoiceRecordWithItems, PickerArticle, PickerCustomer } from './draft'

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

export async function listInvoices(supabase: Client, opts: { q: string }): Promise<InvoiceListRow[]> {
  let query = supabase
    .from('invoices')
    .select('id, number, issue_date, due_date, recipient, invoice_items(quantity, unit_price_gross, vat_rate)')
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
      row.invoice_items.map((i) => ({ quantity: i.quantity, unitPriceGross: i.unit_price_gross, vatRate: i.vat_rate })),
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
  id: string,
): Promise<(InvoiceRecordWithItems & { id: string; updated_at: string }) | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, updated_at, number, customer_id, recipient, issue_date, service_date_from, service_date_to, payment_days, intro_text, closing_text, invoice_items(id, position, description, quantity, unit, unit_price_gross, vat_rate, article_id)',
    )
    .eq('id', id)
    .order('position', { referencedTable: 'invoice_items' })
    .maybeSingle()
  if (error) throw new Error(`Loading invoice failed: ${error.message}`)
  return data
}

export async function listInvoiceNumbers(supabase: Client): Promise<string[]> {
  const { data, error } = await supabase.from('invoices').select('number')
  if (error) throw new Error(`Loading invoice numbers failed: ${error.message}`)
  return data.map((r) => r.number)
}

export async function getInvoiceSettings(
  supabase: Client,
): Promise<{ numberFormat: string | null; defaultPaymentDays: number | null; theme: Theme }> {
  const { data, error } = await supabase.from('settings').select('number_format, default_payment_days, theme').single()
  if (error) throw new Error(`Loading settings failed: ${error.message}`)
  return { numberFormat: data.number_format, defaultPaymentDays: data.default_payment_days, theme: parseTheme(data.theme) }
}

export async function listCustomerChoices(supabase: Client): Promise<PickerCustomer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, contact_person, street, postal_code, city, country_code, vat_id')
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

export async function listArticleChoices(supabase: Client): Promise<PickerArticle[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, name, description, unit, unit_price_gross, vat_rate')
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
