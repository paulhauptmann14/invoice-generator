import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getInvoice } from '@/features/invoices/queries'
import { type Company, missingCompanyFields, parseCompany } from '@/lib/domain/company'
import { buildFilename } from '@/lib/domain/filename'
import { parseTheme, type Theme } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput, type InvoiceViewModel } from '@/lib/domain/view-model'
import type { Database } from '@/lib/supabase/database.types'
import { filenameContextOf } from './filename-context'
import { inputFromInvoice } from './invoice-input'
import { type DocumentLogo, loadLogo } from './logo'

type Client = SupabaseClient<Database>

export type DocumentSettings = { company: Company; theme: Theme; logo: DocumentLogo | null; filenameTemplate: string; missing: string[] }
export type InvoiceDocument = {
  vm: InvoiceViewModel
  /** The data behind `vm`, for the ZUGFeRD XML. */
  input: InvoiceInput
  company: Company
  theme: Theme
  logo: DocumentLogo | null
  filenames: { pdf: string; docx: string }
  missing: string[]
}

export async function loadDocumentSettings(supabase: Client, tenantId: string): Promise<DocumentSettings> {
  const { data, error } = await supabase.from('settings').select('company, theme, filename_template').eq('tenant_id', tenantId).single()
  if (error) throw new Error(`Loading settings failed: ${error.message}`)
  const company = parseCompany(data.company)
  const theme = parseTheme(data.theme)
  return { company, theme, logo: await loadLogo(supabase, tenantId, theme), filenameTemplate: data.filename_template, missing: missingCompanyFields(company) }
}

/** Name of an invoice's number range for the {Kreis} placeholder; null without a range. */
async function loadRangeName(supabase: Client, tenantId: string, rangeId: string | null): Promise<string | null> {
  if (!rangeId) return null
  const { data, error } = await supabase.from('number_ranges').select('name').eq('id', rangeId).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Loading number range failed: ${error.message}`)
  return data?.name ?? null
}

/** Saved invoice + settings -> everything a renderer and the download need. Null if the invoice does not exist. */
export async function loadInvoiceDocument(supabase: Client, tenantId: string, id: string): Promise<InvoiceDocument | null> {
  const [invoice, settings] = await Promise.all([getInvoice(supabase, tenantId, id), loadDocumentSettings(supabase, tenantId)])
  if (!invoice) return null
  const input = inputFromInvoice(invoice)
  const ctx = filenameContextOf(invoice, await loadRangeName(supabase, tenantId, invoice.number_range_id))
  return {
    vm: buildInvoiceViewModel(input, settings.company, settings.theme),
    input,
    company: settings.company,
    theme: settings.theme,
    logo: settings.logo,
    filenames: {
      pdf: buildFilename(settings.filenameTemplate, ctx, 'pdf'),
      docx: buildFilename(settings.filenameTemplate, ctx, 'docx'),
    },
    missing: settings.missing,
  }
}
