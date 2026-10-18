import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/require-tenant'
import { tenantPath } from '@/lib/tenant-paths'

export default async function SettingsPage({ params }: { params: Promise<{ betrieb: string }> }) {
  const { tenant } = await requireTenant((await params).betrieb)
  redirect(tenantPath(tenant.id, 'einstellungen/firma'))
}
