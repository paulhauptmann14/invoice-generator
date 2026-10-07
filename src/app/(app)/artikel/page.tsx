import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Artikel' }

export default function ArticlesPage() {
  return (
    <>
      <PageHeader title="Artikel" description="Wiederkehrende Positionen mit Preis und Steuersatz." />
      <EmptyState title="Noch keine Artikel">Das Anlegen von Artikeln wird als Nächstes eingebaut.</EmptyState>
    </>
  )
}
