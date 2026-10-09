'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-tenant'
import { tenantPath } from '@/lib/tenant-paths'
import { tenantNameSchema } from './schema'

export type CreateTenantState = { error: string | null; name: string }

/** Creates a business with default settings and opens it. The database decides who may create one. */
export async function createTenant(_prev: CreateTenantState, formData: FormData): Promise<CreateTenantState> {
  const { supabase } = await requireUser()
  const raw = String(formData.get('name') ?? '')
  const parsed = tenantNameSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, name: raw }

  const { data: id, error } = await supabase.rpc('create_tenant', { p_name: parsed.data })
  if (error || !id) {
    console.error('createTenant failed', error)
    return { error: 'Der Betrieb konnte nicht angelegt werden. Bitte erneut versuchen.', name: raw }
  }
  redirect(tenantPath(id))
}
