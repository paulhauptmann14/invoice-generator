import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { TenantSummary } from '@/lib/tenant-paths'

export type Access =
  | { status: 'anonymous' }
  | { status: 'no-tenant'; userId: string; email: string | null }
  | { status: 'ok'; userId: string; email: string | null; tenants: TenantSummary[] }

/**
 * Verifies the session and loads the user's tenants.
 * getClaims() validates the JWT signature (unlike getSession()). RLS only returns tenants the user
 * is a member of, so the list doubles as the membership check without extra API surface.
 */
export async function resolveAccess(supabase: SupabaseClient<Database>): Promise<Access> {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return { status: 'anonymous' }

  const userId = claims.sub
  const email = typeof claims.email === 'string' ? claims.email : null

  const { data: tenants, error: dbError } = await supabase.from('tenants').select('id, name').order('name').order('id')
  if (dbError) throw new Error(`Loading tenants failed: ${dbError.message}`)

  return tenants.length > 0 ? { status: 'ok', userId, email, tenants } : { status: 'no-tenant', userId, email }
}
