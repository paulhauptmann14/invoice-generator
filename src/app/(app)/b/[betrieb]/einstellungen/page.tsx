import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { requireTenant } from '@/lib/auth/require-tenant'

export const metadata: Metadata = { title: 'Einstellungen' }

export default async function SettingsPage({ params }: { params: Promise<{ betrieb: string }> }) {
  await requireTenant((await params).betrieb)
  return (
    <>
      <PageHeader title="Einstellungen" description="Firmendaten, Rechnungsdesign, Nummern und Dateinamen." />
      <EmptyState title="Noch nichts einzustellen">Die Einstellungen werden in einem späteren Schritt eingebaut.</EmptyState>
    </>
  )
}
