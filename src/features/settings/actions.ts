'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { listNumberRanges } from '@/features/invoices/queries'
import { requireTenant } from '@/lib/auth/require-tenant'
import { pathErrorsFrom } from '@/lib/form'
import { tenantPath } from '@/lib/tenant-paths'
import { archiveBlockReason } from './number-range-rules'
import {
  createNumberRange,
  saveAppearance,
  saveCompany,
  saveFilenameTemplate,
  savePayment,
  setDefaultNumberRange,
  setNumberRangeArchived,
  updateNumberRange,
} from './repository'
import { appearanceFormSchema, companyFormSchema, filenameFormSchema, numberRangeFormSchema, paymentFormSchema } from './schemas'

/** Errors keyed by field path ("bankAccounts.0.iban"); German messages. */
export type SettingsFormState = { message: string | null; errors: Record<string, string> }

const idSchema = z.uuid()
const CHECK_FIELDS = 'Bitte die markierten Felder prüfen.'
const SAVE_FAILED = 'Die Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.'

/** The settings forms send their state as JSON (like the invoice form). */
function readPayload(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get('payload') ?? ''))
  } catch {
    return undefined
  }
}

async function saveTab<T>(
  tenantId: string,
  formData: FormData,
  schema: z.ZodType<T>,
  save: (ctx: Awaited<ReturnType<typeof requireTenant>>, data: T) => Promise<void>,
  tab: string,
  opts: { refreshShell?: boolean } = {},
): Promise<SettingsFormState> {
  const ctx = await requireTenant(tenantId)
  const parsed = schema.safeParse(readPayload(formData))
  if (!parsed.success) return { message: CHECK_FIELDS, errors: pathErrorsFrom(parsed.error) }
  try {
    await save(ctx, parsed.data)
  } catch (error) {
    console.error(`Saving settings (${tab}) failed`, error)
    return { message: SAVE_FAILED, errors: {} }
  }
  // The business name is shown in the app shell (switcher), which a plain redirect would keep as it was.
  if (opts.refreshShell) revalidatePath('/b/[betrieb]', 'layout')
  redirect(tenantPath(ctx.tenant.id, `einstellungen/${tab}?gespeichert=1`))
}

export async function saveCompanySettings(tenantId: string, _prev: SettingsFormState, formData: FormData) {
  return saveTab(tenantId, formData, companyFormSchema, ({ supabase, tenant }, data) => saveCompany(supabase, tenant.id, data), 'firma', {
    refreshShell: true,
  })
}

export async function savePaymentSettings(tenantId: string, _prev: SettingsFormState, formData: FormData) {
  return saveTab(tenantId, formData, paymentFormSchema, ({ supabase, tenant }, data) => savePayment(supabase, tenant.id, data), 'zahlung')
}

export async function saveAppearanceSettings(tenantId: string, _prev: SettingsFormState, formData: FormData) {
  return saveTab(tenantId, formData, appearanceFormSchema, ({ supabase, tenant }, data) => saveAppearance(supabase, tenant.id, data), 'erscheinungsbild')
}

export async function saveFilenameSettings(tenantId: string, _prev: SettingsFormState, formData: FormData) {
  return saveTab(
    tenantId,
    formData,
    filenameFormSchema,
    ({ supabase, tenant }, data) => saveFilenameTemplate(supabase, tenant.id, data.filenameTemplate),
    'nummern',
  )
}

/** Creates (id = null) or updates a number range. */
export async function saveNumberRange(tenantId: string, id: string | null, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (id !== null && !idSchema.safeParse(id).success) throw new Error('Invalid number range id')
  const parsed = numberRangeFormSchema.safeParse(readPayload(formData))
  if (!parsed.success) return { message: CHECK_FIELDS, errors: pathErrorsFrom(parsed.error) }

  const result = id === null ? await createNumberRange(supabase, tenant.id, parsed.data) : await updateNumberRange(supabase, tenant.id, id, parsed.data)
  if (!result.ok && result.reason === 'duplicate') return { message: CHECK_FIELDS, errors: { name: 'Diesen Namen gibt es schon.' } }
  if (!result.ok) return { message: 'Diesen Nummernkreis gibt es nicht (mehr).', errors: {} }
  redirect(tenantPath(tenant.id, 'einstellungen/nummern?gespeichert=1'))
}

export async function makeDefaultNumberRange(tenantId: string, id: string): Promise<SettingsFormState> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (!idSchema.safeParse(id).success) throw new Error('Invalid number range id')
  const result = await setDefaultNumberRange(supabase, tenant.id, id)
  if (!result.ok) {
    return { message: result.reason === 'archived' ? 'Ein archivierter Kreis kann nicht Standard sein.' : 'Diesen Nummernkreis gibt es nicht (mehr).', errors: {} }
  }
  redirect(tenantPath(tenant.id, 'einstellungen/nummern?gespeichert=1'))
}

export async function archiveNumberRange(tenantId: string, id: string, archived: boolean): Promise<SettingsFormState> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (!idSchema.safeParse(id).success) throw new Error('Invalid number range id')
  if (archived) {
    const reason = archiveBlockReason(await listNumberRanges(supabase, tenant.id), id)
    if (reason) return { message: reason, errors: {} }
  }
  await setNumberRangeArchived(supabase, tenant.id, id, archived)
  redirect(tenantPath(tenant.id, 'einstellungen/nummern?gespeichert=1'))
}
