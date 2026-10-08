import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-tenant'
import { LAST_TENANT_COOKIE, pickTenant, SECTIONS, type Section, tenantPath } from '@/lib/tenant-paths'

/** Old bookmarks (/rechnungen, /kunden, …) lead to the same section of the last used tenant. */
export default async function SectionRedirect({ params }: { params: Promise<{ bereich: string }> }) {
  const { bereich } = await params
  if (!SECTIONS.includes(bereich as Section)) notFound()
  const { tenants } = await requireUser()
  const tenant = pickTenant(tenants, (await cookies()).get(LAST_TENANT_COOKIE)?.value)
  // requireUser() guarantees at least one tenant.
  redirect(tenantPath(tenant!.id, bereich))
}
