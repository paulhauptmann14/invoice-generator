'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireMember } from '@/lib/auth/require-member'
import { todayIso, yearOf } from '@/lib/domain/dates'
import { suggestNextNumber } from '@/lib/domain/invoice-number'
import { pathErrorsFrom } from '@/lib/form'
import type { Json } from '@/lib/supabase/database.types'
import { getInvoice, getInvoiceSettings, listInvoiceNumbers } from './queries'
import { type InvoiceSubmission, invoiceSchema } from './schema'

export type InvoiceFormState = { message: string | null; errors: Record<string, string>; suggestedNumber: string | null }

const idSchema = z.uuid()

function rpcArgs(s: InvoiceSubmission) {
  return {
    p_invoice: {
      number: s.number,
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

export async function saveInvoice(id: string | null, _prev: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const { supabase } = await requireMember()
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
    p_id: id as unknown as string,
    ...rpcArgs(parsed.data),
  })
  if (error) {
    if (error.code === '23505') {
      const [settings, numbers] = await Promise.all([getInvoiceSettings(supabase), listInvoiceNumbers(supabase)])
      const suggestion = suggestNextNumber(settings.numberFormat, yearOf(parsed.data.issueDate), numbers) || null
      return {
        message: 'Diese Rechnungsnummer ist bereits vergeben.',
        errors: { number: 'Diese Rechnungsnummer ist bereits vergeben.' },
        suggestedNumber: suggestion,
      }
    }
    console.error('saveInvoice failed', error)
    return { message: 'Die Rechnung konnte nicht gespeichert werden. Bitte erneut versuchen.', errors: {}, suggestedNumber: null }
  }
  redirect(`/rechnungen/${savedId}?gespeichert=1`)
}

export async function copyInvoice(id: string): Promise<void> {
  const { supabase } = await requireMember()
  if (!idSchema.safeParse(id).success) throw new Error('Invalid invoice id')
  const source = await getInvoice(supabase, id)
  if (!source) throw new Error('Invoice not found')

  const [settings, numbers] = await Promise.all([getInvoiceSettings(supabase), listInvoiceNumbers(supabase)])
  const today = todayIso()
  const number = suggestNextNumber(settings.numberFormat, yearOf(today), numbers) || `${source.number}-Kopie`

  const { data: newId, error } = await supabase.rpc('save_invoice', {
    p_id: null as unknown as string,
    p_invoice: {
      number,
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
  redirect(`/rechnungen/${newId}?kopiert=1`)
}

export async function deleteInvoice(id: string): Promise<void> {
  const { supabase } = await requireMember()
  if (!idSchema.safeParse(id).success) throw new Error('Invalid invoice id')

  // Archived PDFs live under "<invoice id>/" in the private bucket; remove them first.
  const { data: files, error: listError } = await supabase.storage.from('invoice-pdfs').list(id, { limit: 1000 })
  if (listError) throw new Error(`Listing invoice files failed: ${listError.message}`)
  if (files.length > 0) {
    const { error: removeError } = await supabase.storage.from('invoice-pdfs').remove(files.map((f) => `${id}/${f.name}`))
    if (removeError) throw new Error(`Removing invoice files failed: ${removeError.message}`)
  }

  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw new Error(`Deleting invoice failed: ${error.message}`)
  redirect('/rechnungen?geloescht=1')
}
