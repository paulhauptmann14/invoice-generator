'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/require-tenant'
import { todayIso } from '@/lib/domain/dates'
import { pathErrorsFrom } from '@/lib/form'
import type { Json } from '@/lib/supabase/database.types'
import { tenantPath } from '@/lib/tenant-paths'
import { defaultRange, suggestForRange } from './draft'
import { getInvoice, listInvoiceNumbers, listNumberRanges } from './queries'
import { type InvoiceSubmission, invoiceSchema } from './schema'

export type InvoiceFormState = { message: string | null; errors: Record<string, string>; suggestedNumber: string | null }

const idSchema = z.uuid()

function rpcArgs(s: InvoiceSubmission) {
  return {
    p_invoice: {
      number: s.number,
      number_range_id: s.numberRangeId,
      customer_id: s.customerId,
      save_as_customer: s.saveAsCustomer,
      recipient: s.recipient,
      issue_date: s.issueDate,
      service_date_from: s.serviceDateFrom,
      service_date_to: s.serviceDateTo,
      payment_days: s.paymentDays,
      intro_text: s.introText,
      closing_text: s.closingText,
    },
    p_items: s.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unit_price_gross: i.unitPriceGross,
      vat_rate: i.vatRate,
      article_id: i.articleId,
      save_as_article: i.saveAsArticle,
    })),
  }
}

export async function saveInvoice(
  tenantId: string,
  id: string | null,
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (id !== null && !idSchema.safeParse(id).success) throw new Error('Invalid invoice id')

  let raw: unknown
  try {
    raw = JSON.parse(String(formData.get('payload') ?? ''))
  } catch {
    return { message: 'Die Rechnung konnte nicht gelesen werden. Bitte Seite neu laden.', errors: {}, suggestedNumber: null }
  }
  const parsed = invoiceSchema.safeParse(raw)
  if (!parsed.success) {
    return { message: 'Bitte die markierten Felder prüfen.', errors: pathErrorsFrom(parsed.error), suggestedNumber: null }
  }

  const { data: savedId, error } = await supabase.rpc('save_invoice', {
    p_tenant_id: tenant.id,
    p_id: id as unknown as string,
    ...rpcArgs(parsed.data),
  })
  if (error) {
    if (error.code === '23505') {
      const [ranges, existing] = await Promise.all([listNumberRanges(supabase, tenant.id), listInvoiceNumbers(supabase, tenant.id)])
      const suggestion = suggestForRange({ ranges, existing }, parsed.data.numberRangeId, parsed.data.issueDate) || null
      return {
        message: 'Diese Rechnungsnummer ist bereits vergeben.',
        errors: { number: 'Diese Rechnungsnummer ist bereits vergeben.' },
        suggestedNumber: suggestion,
      }
    }
    console.error('saveInvoice failed', error)
    return { message: 'Die Rechnung konnte nicht gespeichert werden. Bitte erneut versuchen.', errors: {}, suggestedNumber: null }
  }
  redirect(tenantPath(tenant.id, `rechnungen/${savedId}?gespeichert=1`))
}

export async function copyInvoice(tenantId: string, id: string): Promise<void> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (!idSchema.safeParse(id).success) throw new Error('Invalid invoice id')
  const source = await getInvoice(supabase, tenant.id, id)
  if (!source) throw new Error('Invoice not found')

  const [ranges, existing] = await Promise.all([listNumberRanges(supabase, tenant.id), listInvoiceNumbers(supabase, tenant.id)])
  const today = todayIso()
  // The copy keeps the range of the original; an archived (or missing) range falls back to the default.
  const sourceRange = ranges.find((r) => r.id === source.number_range_id && !r.archived)
  const rangeId = sourceRange?.id ?? defaultRange(ranges)?.id ?? null
  const number = suggestForRange({ ranges, existing }, rangeId, today) || `${source.number}-Kopie`

  const { data: newId, error } = await supabase.rpc('save_invoice', {
    p_tenant_id: tenant.id,
    p_id: null as unknown as string,
    p_invoice: {
      number,
      number_range_id: rangeId,
      customer_id: source.customer_id,
      // Copied verbatim from the jsonb column it was read from.
      recipient: source.recipient as Json,
      issue_date: today,
      service_date_from: today,
      service_date_to: null,
      payment_days: source.payment_days,
      intro_text: source.intro_text,
      closing_text: source.closing_text,
    },
    p_items: source.invoice_items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unit_price_gross: i.unit_price_gross,
      vat_rate: i.vat_rate,
      article_id: i.article_id,
    })),
  })
  if (error) throw new Error(`Copying invoice failed: ${error.message}`)
  redirect(tenantPath(tenant.id, `rechnungen/${newId}?kopiert=1`))
}

export async function deleteInvoice(tenantId: string, id: string): Promise<void> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (!idSchema.safeParse(id).success) throw new Error('Invalid invoice id')

  // Archived PDFs live under "<tenant id>/<invoice id>/" in the private bucket; remove them first.
  const folder = `${tenant.id}/${id}`
  const { data: files, error: listError } = await supabase.storage.from('invoice-pdfs').list(folder, { limit: 1000 })
  if (listError) throw new Error(`Listing invoice files failed: ${listError.message}`)
  if (files.length > 0) {
    const { error: removeError } = await supabase.storage.from('invoice-pdfs').remove(files.map((f) => `${folder}/${f.name}`))
    if (removeError) throw new Error(`Removing invoice files failed: ${removeError.message}`)
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id).eq('tenant_id', tenant.id)
  if (error) throw new Error(`Deleting invoice failed: ${error.message}`)
  redirect(tenantPath(tenant.id, 'rechnungen?geloescht=1'))
}
