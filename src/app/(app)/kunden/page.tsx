import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Kunden' }

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Kunden" description="Kundenstamm mit Adressen für die Rechnungen." />
      <EmptyState title="Noch keine Kunden">Das Anlegen von Kunden wird als Nächstes eingebaut.</EmptyState>
    </>
  )
}
