import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { type Company, parseCompany } from '@/lib/domain/company'
import { parseTheme, type Theme } from '@/lib/domain/theme'
import type { Database, Json } from '@/lib/supabase/database.types'
import { applyAppearanceForm, applyCompanyForm, applyPaymentForm } from './merge'
import type { AppearanceForm, CompanyForm, NumberRangeForm, PaymentForm } from './schemas'

type Client = SupabaseClient<Database>

export type TenantSettings = {
  tenantName: string
  company: Company
  theme: Theme
  filenameTemplate: string
  defaultPaymentDays: number | null
  /** Changes on every save; used as remount key for the forms. */
  updatedAt: string
}

export async function loadSettings(supabase: Client, tenantId: string): Promise<TenantSettings> {
  const [tenant, settings] = await Promise.all([
    supabase.from('tenants').select('name').eq('id', tenantId).single(),
    supabase.from('settings').select('company, theme, filename_template, default_payment_days, updated_at').eq('tenant_id', tenantId).single(),
  ])
  if (tenant.error) throw new Error(`Loading tenant failed: ${tenant.error.message}`)
  if (settings.error) throw new Error(`Loading settings failed: ${settings.error.message}`)
  return {
    tenantName: tenant.data.name,
    company: parseCompany(settings.data.company),
    theme: parseTheme(settings.data.theme),
    filenameTemplate: settings.data.filename_template,
    defaultPaymentDays: settings.data.default_payment_days,
    updatedAt: settings.data.updated_at,
  }
}

/**
 * Version of the current logo for the app shell (the file name, which changes with every upload), or null
 * without a logo. Reads only the logo path, not the whole settings row.
 */
export async function loadLogoVersion(supabase: Client, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase.from('settings').select('logo:theme->logo->>path').eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Loading logo path failed: ${error.message}`)
  const path = typeof data?.logo === 'string' ? data.logo : null
  return path?.split('/').pop() || null
}

async function updateSettings(
  supabase: Client,
  tenantId: string,
  values: { company?: Company; theme?: Theme; filename_template?: string; default_payment_days?: number | null },
) {
  const { error } = await supabase
    .from('settings')
    .update({
      ...values,
      // Stored as jsonb; both objects are plain JSON produced by their zod schemas.
      company: values.company as NonNullable<Json> | undefined,
      theme: values.theme as NonNullable<Json> | undefined,
    })
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`Saving settings failed: ${error.message}`)
}

/** The tenant name lives in tenants.name, the rest of the tab in settings.company. */
export async function saveCompany(supabase: Client, tenantId: string, form: CompanyForm): Promise<void> {
  const current = await loadSettings(supabase, tenantId)
  const { error } = await supabase.from('tenants').update({ name: form.tenantName }).eq('id', tenantId)
  if (error) throw new Error(`Renaming tenant failed: ${error.message}`)
  await updateSettings(supabase, tenantId, { company: applyCompanyForm(current.company, form) })
}

export async function savePayment(supabase: Client, tenantId: string, form: PaymentForm): Promise<void> {
  const current = await loadSettings(supabase, tenantId)
  const next = applyPaymentForm(current.company, current.theme, form)
  await updateSettings(supabase, tenantId, { company: next.company, theme: next.theme, default_payment_days: next.defaultPaymentDays })
}

export async function saveAppearance(supabase: Client, tenantId: string, form: AppearanceForm): Promise<void> {
  const current = await loadSettings(supabase, tenantId)
  await updateSettings(supabase, tenantId, { theme: applyAppearanceForm(current.theme, form) })
}

export async function saveTheme(supabase: Client, tenantId: string, theme: Theme): Promise<void> {
  await updateSettings(supabase, tenantId, { theme })
}

export async function saveFilenameTemplate(supabase: Client, tenantId: string, template: string): Promise<void> {
  await updateSettings(supabase, tenantId, { filename_template: template })
}

type RangeResult = { ok: true } | { ok: false; reason: 'duplicate' | 'not-found' | 'archived' }

const duplicate = (code: string | undefined) => code === '23505'

export async function createNumberRange(supabase: Client, tenantId: string, form: NumberRangeForm): Promise<RangeResult> {
  const { error } = await supabase.from('number_ranges').insert({ tenant_id: tenantId, name: form.name, format: form.format })
  if (duplicate(error?.code)) return { ok: false, reason: 'duplicate' }
  if (error) throw new Error(`Creating number range failed: ${error.message}`)
  return { ok: true }
}

export async function updateNumberRange(supabase: Client, tenantId: string, id: string, form: NumberRangeForm): Promise<RangeResult> {
  const { data, error } = await supabase
    .from('number_ranges')
    .update({ name: form.name, format: form.format })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
  if (duplicate(error?.code)) return { ok: false, reason: 'duplicate' }
  if (error) throw new Error(`Updating number range failed: ${error.message}`)
  return data.length > 0 ? { ok: true } : { ok: false, reason: 'not-found' }
}

export async function setNumberRangeArchived(supabase: Client, tenantId: string, id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from('number_ranges')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) throw new Error(`Archiving number range failed: ${error.message}`)
}

export async function setDefaultNumberRange(supabase: Client, tenantId: string, id: string): Promise<RangeResult> {
  const { error } = await supabase.rpc('set_default_number_range', { p_tenant_id: tenantId, p_id: id })
  if (error?.code === 'P0002') return { ok: false, reason: 'not-found' }
  if (error?.code === '22023') return { ok: false, reason: 'archived' }
  if (error) throw new Error(`Setting default number range failed: ${error.message}`)
  return { ok: true }
}
