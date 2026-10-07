import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { ListToolbar } from '@/components/list-toolbar'
import { PageHeader } from '@/components/page-header'
import { StatusBanner } from '@/components/status-banner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { setCustomerArchived } from '@/features/customers/actions'
import { hasArchivedCustomers, LIST_LIMIT, listCustomers } from '@/features/customers/queries'
import { requireMember } from '@/lib/auth/require-member'
import { normalizeSearch } from '@/lib/search'

export const metadata: Metadata = { title: 'Kunden' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireMember()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const archived = params.ansicht === 'archiv'
  const customers = await listCustomers(supabase, { q, archived })
  const archivedId = typeof params.archiviert === 'string' ? params.archiviert : null
  // Only needed for an honest empty state: "nothing yet" vs. "everything archived".
  const onlyArchived = customers.length === 0 && !archived && !normalizeSearch(q) && (await hasArchivedCustomers(supabase))

  return (
    <>
      <PageHeader
        title="Kunden"
        description="Kundenstamm mit Adressen für die Rechnungen."
        actions={
          <Button asChild>
            <Link href="/kunden/neu">Neuer Kunde</Link>
          </Button>
        }
      />

      {params.gespeichert && <StatusBanner>Kunde gespeichert.</StatusBanner>}
      {params.wiederhergestellt && <StatusBanner>Kunde wiederhergestellt.</StatusBanner>}
      {archivedId && (
        <StatusBanner>
          <span>Kunde archiviert.</span>
          <form action={setCustomerArchived.bind(null, archivedId, false)}>
            <Button type="submit" variant="link" className="h-auto min-h-11 p-0 md:min-h-0">
              Rückgängig
            </Button>
          </form>
        </StatusBanner>
      )}

      <ListToolbar basePath="/kunden" q={q} archived={archived} searchLabel="Kunden durchsuchen" />

      {customers.length === 0 ? (
        normalizeSearch(q) ? (
          <EmptyState title="Keine Treffer">Für „{q}“ wurde kein Kunde gefunden.</EmptyState>
        ) : archived ? (
          <EmptyState title="Keine archivierten Kunden" />
        ) : onlyArchived ? (
          <EmptyState title="Keine aktiven Kunden">
            Alle Kunden sind archiviert.{' '}
            <Link href="/kunden?ansicht=archiv" className="font-medium text-foreground underline underline-offset-4">
              Archivierte anzeigen
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title="Noch keine Kunden">
            Kunden einmal anlegen und beim Schreiben einer Rechnung auswählen.{' '}
            <Link href="/kunden/neu" className="font-medium text-foreground underline underline-offset-4">
              Neuer Kunde
            </Link>
          </EmptyState>
        )
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>E-Mail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/kunden/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                      {c.contact_person && <span className="block text-muted-foreground">{c.contact_person}</span>}
                    </TableCell>
                    <TableCell>{[c.postal_code, c.city].filter(Boolean).join(' ')}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link href={`/kunden/${c.id}`} className="block min-h-11 px-4 py-3">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {[c.contact_person, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {customers.length === LIST_LIMIT && (
            <p className="mt-3 text-sm text-muted-foreground">
              Es werden die ersten {LIST_LIMIT} Kunden angezeigt. Bitte die Suche verwenden.
            </p>
          )}
        </>
      )}
    </>
  )
}
