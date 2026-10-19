import { Archive, SearchX, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { ListToolbar } from '@/components/list-toolbar'
import { PageHeader } from '@/components/page-header'
import { listLinkClass, pressableRowClass, rowLinkClass } from '@/components/pressable'
import { StatusBanner } from '@/components/status-banner'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { setCustomerArchived } from '@/features/customers/actions'
import { hasArchivedCustomers, LIST_LIMIT, listCustomers } from '@/features/customers/queries'
import { requireTenant } from '@/lib/auth/require-tenant'
import { normalizeSearch } from '@/lib/search'
import { tenantPath } from '@/lib/tenant-paths'

export const metadata: Metadata = { title: 'Kunden' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

type Props = { params: Promise<{ betrieb: string }>; searchParams: SearchParams }

export default async function CustomersPage(props: Props) {
  const { betrieb } = await props.params
  const { supabase, tenant } = await requireTenant(betrieb)
  const params = await props.searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const archived = params.ansicht === 'archiv'
  const customers = await listCustomers(supabase, tenant.id, { q, archived })
  const archivedId = typeof params.archiviert === 'string' ? params.archiviert : null
  // Only needed for an honest empty state: "nothing yet" vs. "everything archived".
  const onlyArchived = customers.length === 0 && !archived && !normalizeSearch(q) && (await hasArchivedCustomers(supabase, tenant.id))

  return (
    <>
      <PageHeader
        title="Kunden"
        description="Kundenstamm mit Adressen für die Rechnungen."
        actions={
          <Button asChild>
            <Link href={tenantPath(tenant.id, 'kunden/neu')}>Neuer Kunde</Link>
          </Button>
        }
      />

      {params.gespeichert && <StatusBanner>Kunde gespeichert.</StatusBanner>}
      {params.wiederhergestellt && <StatusBanner>Kunde wiederhergestellt.</StatusBanner>}
      {archivedId && (
        <StatusBanner>
          <span>Kunde archiviert.</span>
          <form action={setCustomerArchived.bind(null, tenant.id, archivedId, false)}>
            <SubmitButton variant="link" pendingLabel="Wird wiederhergestellt …" className="h-auto min-h-11 p-0 md:min-h-0">
              Rückgängig
            </SubmitButton>
          </form>
        </StatusBanner>
      )}

      <ListToolbar basePath={tenantPath(tenant.id, 'kunden')} q={q} archived={archived} searchLabel="Kunden durchsuchen" />

      {customers.length === 0 ? (
        normalizeSearch(q) ? (
          <EmptyState title="Keine Treffer" icon={SearchX}>Für „{q}“ wurde kein Kunde gefunden.</EmptyState>
        ) : archived ? (
          <EmptyState title="Keine archivierten Kunden" icon={Archive} />
        ) : onlyArchived ? (
          <EmptyState title="Keine aktiven Kunden" icon={Users}>
            Alle Kunden sind archiviert.{' '}
            <Link href={tenantPath(tenant.id, 'kunden?ansicht=archiv')} className="font-medium text-foreground underline underline-offset-4">
              Archivierte anzeigen
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title="Noch keine Kunden" icon={Users}>
            Kunden einmal anlegen und beim Schreiben einer Rechnung auswählen.{' '}
            <Link href={tenantPath(tenant.id, 'kunden/neu')} className="font-medium text-foreground underline underline-offset-4">
              Neuer Kunde
            </Link>
          </EmptyState>
        )
      ) : (
        <>
          <div className="surface mt-6 hidden overflow-hidden md:block">
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
                  <TableRow key={c.id} className={pressableRowClass}>
                    <TableCell>
                      <Link href={tenantPath(tenant.id, `kunden/${c.id}`)} className={`font-medium underline-offset-4 hover:underline ${rowLinkClass}`}>
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

          <ul className="surface mt-6 divide-y divide-border overflow-hidden md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link href={tenantPath(tenant.id, `kunden/${c.id}`)} className={`block min-h-11 px-4 py-3 ${listLinkClass}`}>
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
