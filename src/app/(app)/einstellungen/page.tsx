import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Einstellungen' }

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Einstellungen" description="Firmendaten, Rechnungsdesign, Nummern und Dateinamen." />
      <EmptyState title="Noch nichts einzustellen">Die Einstellungen werden in einem späteren Schritt eingebaut.</EmptyState>
    </>
  )
}
