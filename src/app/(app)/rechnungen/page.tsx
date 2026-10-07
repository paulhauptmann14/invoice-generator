import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { InvoiceNumberStamp } from '@/components/invoice-number-stamp'
import { ListToolbar } from '@/components/list-toolbar'
import { PageHeader } from '@/components/page-header'
import { StatusBanner } from '@/components/status-banner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LIST_LIMIT, listInvoices } from '@/features/invoices/queries'
import { requireMember } from '@/lib/auth/require-member'
import { formatDateDe } from '@/lib/domain/dates'
import { formatEuro } from '@/lib/domain/money'
import { normalizeSearch } from '@/lib/search'

export const metadata: Metadata = { title: 'Rechnungen' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireMember()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const invoices = await listInvoices(supabase, { q })

  return (
    <>
      <PageHeader
        title="Rechnungen"
        description="Alle Rechnungen, neueste zuerst."
        actions={
          <Button asChild>
            <Link href="/rechnungen/neu">Neue Rechnung</Link>
          </Button>
        }
      />
      {params.geloescht && <StatusBanner>Rechnung gelöscht.</StatusBanner>}
      <ListToolbar basePath="/rechnungen" q={q} archived={false} showViews={false} searchLabel="Rechnungen durchsuchen" />

      {invoices.length === 0 ? (
        normalizeSearch(q) ? (
          <EmptyState title="Keine Treffer">Für „{q}“ wurde keine Rechnung gefunden.</EmptyState>
        ) : (
          <EmptyState title="Noch keine Rechnungen">
            Die erste Rechnung schreiben – Kunden und Artikel lassen sich direkt im Formular auswählen.{' '}
            <Link href="/rechnungen/neu" className="font-medium text-foreground underline underline-offset-4">
              Neue Rechnung
            </Link>
          </EmptyState>
        )
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr.</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead>Fällig</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Link href={`/rechnungen/${i.id}`} aria-label={`Rechnung ${i.number} öffnen`}>
                        <InvoiceNumberStamp number={i.number} />
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateDe(i.issueDate)}</TableCell>
                    <TableCell>{i.recipientName}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatDateDe(i.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuro(i.grossCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card md:hidden">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/rechnungen/${i.id}`} className="flex min-h-11 items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0">
                    <InvoiceNumberStamp number={i.number} />
                    <span className="mt-1 block truncate">{i.recipientName}</span>
                    <span className="block text-sm text-muted-foreground">{formatDateDe(i.issueDate)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatEuro(i.grossCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {invoices.length === LIST_LIMIT && (
            <p className="mt-3 text-sm text-muted-foreground">Es werden die neuesten {LIST_LIMIT} Rechnungen angezeigt. Bitte die Suche verwenden.</p>
          )}
        </>
      )}
    </>
  )
}
