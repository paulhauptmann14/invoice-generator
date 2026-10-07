import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Rechnungen' }

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="Rechnungen" description="Alle Rechnungen, neueste zuerst." />
      <EmptyState title="Noch keine Rechnungen">Das Schreiben von Rechnungen wird als Nächstes eingebaut.</EmptyState>
    </>
  )
}
