import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveMembership } from './membership'

// Deduplicated per request (React cache is request-scoped on the server, never shared across users).
const loadMembership = cache(async () => {
  const supabase = await createClient()
  return { supabase, membership: await resolveMembership(supabase) }
})

/** For pages, layouts and server actions. Redirects unless the current user is a member. */
export async function requireMember() {
  const { supabase, membership } = await loadMembership()
  if (membership.status === 'anonymous') redirect('/login')
  if (membership.status === 'forbidden') redirect('/kein-zugriff')
  return { supabase, userId: membership.userId, email: membership.email }
}

/** For route handlers. Returns an error response instead of redirecting. */
export async function requireMemberForRoute() {
  const { supabase, membership } = await loadMembership()
  if (membership.status === 'anonymous') {
    return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) } as const
  }
  if (membership.status === 'forbidden') {
    return { error: Response.json({ error: 'forbidden' }, { status: 403 }) } as const
  }
  return { error: null, supabase, userId: membership.userId, email: membership.email } as const
}
