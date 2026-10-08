import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { resolveAccess } from './access'

// Deduplicated per request (React cache is request-scoped on the server, never shared across users).
const loadAccess = cache(async () => {
  const supabase = await createClient()
  return { supabase, access: await resolveAccess(supabase) }
})

const tenantIdSchema = z.uuid()

/** Signed-in user with at least one tenant (root redirects, creating tenants). */
export async function requireUser() {
  const { supabase, access } = await loadAccess()
  if (access.status === 'anonymous') redirect('/login')
  if (access.status === 'no-tenant') redirect('/kein-zugriff')
  return { supabase, userId: access.userId, email: access.email, tenants: access.tenants }
}

/** For pages, layouts and server actions below /b/[betrieb]. Unknown or foreign tenants are a 404. */
export async function requireTenant(tenantId: string) {
  const user = await requireUser()
  const tenant = tenantIdSchema.safeParse(tenantId).success ? user.tenants.find((t) => t.id === tenantId) : undefined
  if (!tenant) notFound()
  return { ...user, tenant }
}

/** For route handlers. Returns an error response instead of redirecting. */
export async function requireTenantForRoute(tenantId: string) {
  const { supabase, access } = await loadAccess()
  if (access.status === 'anonymous') {
    return { error: Response.json({ error: 'unauthorized' }, { status: 401 }) } as const
  }
  if (access.status === 'no-tenant') {
    return { error: Response.json({ error: 'forbidden' }, { status: 403 }) } as const
  }
  const tenant = tenantIdSchema.safeParse(tenantId).success ? access.tenants.find((t) => t.id === tenantId) : undefined
  if (!tenant) return { error: Response.json({ error: 'not found' }, { status: 404 }) } as const
  return { error: null, supabase, userId: access.userId, email: access.email, tenant } as const
}
