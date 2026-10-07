import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type Membership =
  | { status: 'anonymous' }
  | { status: 'forbidden'; userId: string; email: string | null }
  | { status: 'member'; userId: string; email: string | null }

/**
 * Verifies the session and the user's membership.
 * getClaims() validates the JWT signature (unlike getSession()). Membership is derived
 * from RLS: only members can see the single settings row, so no extra API surface is needed.
 */
export async function resolveMembership(supabase: SupabaseClient<Database>): Promise<Membership> {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return { status: 'anonymous' }

  const userId = claims.sub
  const email = typeof claims.email === 'string' ? claims.email : null

  const { data: row, error: dbError } = await supabase.from('settings').select('id').maybeSingle()
  if (dbError) throw new Error(`Membership check failed: ${dbError.message}`)

  return row ? { status: 'member', userId, email } : { status: 'forbidden', userId, email }
}
