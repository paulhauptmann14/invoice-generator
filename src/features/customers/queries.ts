import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/supabase/database.types'
import { escapeLike, normalizeSearch } from '@/lib/search'

type Client = SupabaseClient<Database>
export const LIST_LIMIT = 500

export type CustomerRow = Pick<Tables<'customers'>, 'id' | 'name' | 'contact_person' | 'postal_code' | 'city' | 'email' | 'archived_at'>
export type CustomerRecord = Tables<'customers'>

export async function listCustomers(supabase: Client, tenantId: string, opts: { q: string; archived: boolean }): Promise<CustomerRow[]> {
  let query = supabase
    .from('customers')
    .select('id, name, contact_person, postal_code, city, email, archived_at')
    .eq('tenant_id', tenantId)
    .order('name')
    .limit(LIST_LIMIT)
  query = opts.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  const term = normalizeSearch(opts.q)
  if (term) query = query.ilike('search_text', `%${escapeLike(term)}%`)

  const { data, error } = await query
  if (error) throw new Error(`Loading customers failed: ${error.message}`)
  return data
}

export async function getCustomer(supabase: Client, tenantId: string, id: string): Promise<CustomerRecord | null> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Loading customer failed: ${error.message}`)
  return data
}

/** Distinguishes "no customers yet" from "all customers are archived" in the empty state. */
export async function hasArchivedCustomers(supabase: Client, tenantId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('archived_at', 'is', null)
  if (error) throw new Error(`Counting archived customers failed: ${error.message}`)
  return (count ?? 0) > 0
}
