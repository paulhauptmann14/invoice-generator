'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/require-tenant'
import { type FormState, fieldErrorsFrom } from '@/lib/form'
import { tenantPath } from '@/lib/tenant-paths'
import { CUSTOMER_FIELDS, type CustomerField, customerSchema } from './schema'

const idSchema = z.uuid()

function readForm(formData: FormData): Record<CustomerField, string> {
  return Object.fromEntries(CUSTOMER_FIELDS.map((k) => [k, String(formData.get(k) ?? '')])) as Record<CustomerField, string>
}

export async function saveCustomer(
  tenantId: string,
  id: string | null,
  _prev: FormState<CustomerField>,
  formData: FormData,
): Promise<FormState<CustomerField>> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (id !== null && !idSchema.safeParse(id).success) throw new Error('Invalid customer id')

  const values = readForm(formData)
  const parsed = customerSchema.safeParse(values)
  if (!parsed.success) {
    return { message: 'Bitte die markierten Felder prüfen.', fieldErrors: fieldErrorsFrom<CustomerField>(parsed.error), values }
  }

  const c = parsed.data
  const row = {
    name: c.name,
    contact_person: c.contactPerson,
    street: c.street,
    postal_code: c.postalCode,
    city: c.city,
    country_code: c.countryCode,
    email: c.email,
    vat_id: c.vatId,
    notes: c.notes,
  }
  const { error } =
    id === null
      ? await supabase.from('customers').insert({ ...row, tenant_id: tenant.id })
      : await supabase.from('customers').update(row).eq('id', id).eq('tenant_id', tenant.id)
  if (error) {
    console.error('saveCustomer failed', error)
    return { message: 'Der Kunde konnte nicht gespeichert werden. Bitte erneut versuchen.', fieldErrors: {}, values }
  }
  redirect(tenantPath(tenant.id, 'kunden?gespeichert=1'))
}

export async function setCustomerArchived(tenantId: string, id: string, archived: boolean): Promise<void> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (!idSchema.safeParse(id).success) throw new Error('Invalid customer id')

  const { error } = await supabase
    .from('customers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
  if (error) throw new Error(`Archiving customer failed: ${error.message}`)
  redirect(tenantPath(tenant.id, archived ? `kunden?archiviert=${id}` : 'kunden?wiederhergestellt=1'))
}
