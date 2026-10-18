'use server'

import { redirect } from 'next/navigation'
import { requireUser, requireUserWithoutTenant } from '@/lib/auth/require-tenant'
import { tenantPath } from '@/lib/tenant-paths'
import { tenantNameSchema } from './schema'

export type CreateTenantState = { error: string | null; name: string }

const CREATE_FAILED = 'Der Betrieb konnte nicht angelegt werden. Bitte erneut versuchen.'

/** Creates a business with default settings and opens it. The database decides who may create one. */
export async function createTenant(_prev: CreateTenantState, formData: FormData): Promise<CreateTenantState> {
  const { supabase } = await requireUser()
  const raw = String(formData.get('name') ?? '')
  const parsed = tenantNameSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw }

  const { data: id, error } = await supabase.rpc('create_tenant', { p_name: parsed.data })
  if (error || !id) {
    console.error('createTenant failed', error)
    return { error: CREATE_FAILED, name: raw }
  }
  redirect(tenantPath(id))
}

/** Creates the first business of a new account and opens its company settings with a short confirmation. */
export async function createFirstTenant(_prev: CreateTenantState, formData: FormData): Promise<CreateTenantState> {
  const { supabase } = await requireUserWithoutTenant()
  const raw = String(formData.get('name') ?? '')
  const parsed = tenantNameSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw }

  const { data: id, error } = await supabase.rpc('create_tenant', { p_name: parsed.data })
  if (error || !id) {
    console.error('createFirstTenant failed', error)
    return { error: CREATE_FAILED, name: raw }
  }
  redirect(`${tenantPath(id, 'einstellungen/firma')}?angelegt=1`)
}
