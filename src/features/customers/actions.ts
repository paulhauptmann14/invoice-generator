'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireMember } from '@/lib/auth/require-member'
import { type FormState, fieldErrorsFrom } from '@/lib/form'
import { CUSTOMER_FIELDS, type CustomerField, customerSchema } from './schema'

const idSchema = z.uuid()

function readForm(formData: FormData): Record<CustomerField, string> {
  return Object.fromEntries(CUSTOMER_FIELDS.map((k) => [k, String(formData.get(k) ?? '')])) as Record<CustomerField, string>
}

export async function saveCustomer(
  id: string | null,
  _prev: FormState<CustomerField>,
  formData: FormData,
): Promise<FormState<CustomerField>> {
  const { supabase } = await requireMember()
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
    id === null ? await supabase.from('customers').insert(row) : await supabase.from('customers').update(row).eq('id', id)
  if (error) {
    console.error('saveCustomer failed', error)
    return { message: 'Der Kunde konnte nicht gespeichert werden. Bitte erneut versuchen.', fieldErrors: {}, values }
  }
  redirect('/kunden?gespeichert=1')
}

export async function setCustomerArchived(id: string, archived: boolean): Promise<void> {
  const { supabase } = await requireMember()
  if (!idSchema.safeParse(id).success) throw new Error('Invalid customer id')

  const { error } = await supabase
    .from('customers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`Archiving customer failed: ${error.message}`)
  redirect(archived ? `/kunden?archiviert=${id}` : '/kunden?wiederhergestellt=1')
}
