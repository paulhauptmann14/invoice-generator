import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Nicht gefunden' }

export default function NotFound() {
  return (
    <>
      <PageHeader title="Nicht gefunden" />
      <EmptyState title="Diesen Eintrag gibt es nicht (mehr).">
        <Link href="/" className="font-medium text-foreground underline underline-offset-4">
          Zu den Rechnungen
        </Link>
      </EmptyState>
    </>
  )
}
