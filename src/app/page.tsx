import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-tenant'
import { LAST_TENANT_COOKIE, pickTenant, tenantPath } from '@/lib/tenant-paths'

/** Opens the last used tenant (or the first one). */
export default async function Home() {
  const { tenants } = await requireUser()
  const tenant = pickTenant(tenants, (await cookies()).get(LAST_TENANT_COOKIE)?.value)
  // requireUser() guarantees at least one tenant.
  redirect(tenantPath(tenant!.id))
}
