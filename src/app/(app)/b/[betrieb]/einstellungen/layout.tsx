import { PageHeader } from '@/components/page-header'
import { SettingsNav } from '@/features/settings/settings-nav'
import { requireTenant } from '@/lib/auth/require-tenant'

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ betrieb: string }> }) {
  await requireTenant((await params).betrieb)
  return (
    <>
      <PageHeader title="Einstellungen" description="Firmendaten, Zahlung, Nummern und Aussehen der Rechnungen für diesen Betrieb." />
      <SettingsNav />
      {children}
    </>
  )
}
