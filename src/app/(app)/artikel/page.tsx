import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { ListToolbar } from '@/components/list-toolbar'
import { PageHeader } from '@/components/page-header'
import { StatusBanner } from '@/components/status-banner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { setArticleArchived } from '@/features/articles/actions'
import { hasArchivedArticles, LIST_LIMIT, listArticles } from '@/features/articles/queries'
import { requireMember } from '@/lib/auth/require-member'
import { formatEuro, formatVatRate, toCents } from '@/lib/domain/money'
import { normalizeSearch } from '@/lib/search'

export const metadata: Metadata = { title: 'Artikel' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireMember()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''
  const archived = params.ansicht === 'archiv'
  const articles = await listArticles(supabase, { q, archived })
  const archivedId = typeof params.archiviert === 'string' ? params.archiviert : null
  // Only needed for an honest empty state: "nothing yet" vs. "everything archived".
  const onlyArchived = articles.length === 0 && !archived && !normalizeSearch(q) && (await hasArchivedArticles(supabase))

  return (
    <>
      <PageHeader
        title="Artikel"
        description="Wiederkehrende Positionen mit Bruttopreis und Steuersatz."
        actions={
          <Button asChild>
            <Link href="/artikel/neu">Neuer Artikel</Link>
          </Button>
        }
      />

      {params.gespeichert && <StatusBanner>Artikel gespeichert.</StatusBanner>}
      {params.wiederhergestellt && <StatusBanner>Artikel wiederhergestellt.</StatusBanner>}
      {archivedId && (
        <StatusBanner>
          <span>Artikel archiviert.</span>
          <form action={setArticleArchived.bind(null, archivedId, false)}>
            <Button type="submit" variant="link" className="h-auto min-h-11 p-0 md:min-h-0">
              Rückgängig
            </Button>
          </form>
        </StatusBanner>
      )}

      <ListToolbar basePath="/artikel" q={q} archived={archived} searchLabel="Artikel durchsuchen" />

      {articles.length === 0 ? (
        normalizeSearch(q) ? (
          <EmptyState title="Keine Treffer">Für „{q}“ wurde kein Artikel gefunden.</EmptyState>
        ) : archived ? (
          <EmptyState title="Keine archivierten Artikel" />
        ) : onlyArchived ? (
          <EmptyState title="Keine aktiven Artikel">
            Alle Artikel sind archiviert.{' '}
            <Link href="/artikel?ansicht=archiv" className="font-medium text-foreground underline underline-offset-4">
              Archivierte anzeigen
            </Link>
          </EmptyState>
        ) : (
          <EmptyState title="Noch keine Artikel">
            Häufige Positionen einmal anlegen und beim Rechnungschreiben mit einem Klick einfügen.{' '}
            <Link href="/artikel/neu" className="font-medium text-foreground underline underline-offset-4">
              Neuer Artikel
            </Link>
          </EmptyState>
        )
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Einheit</TableHead>
                  <TableHead className="text-right">Preis brutto</TableHead>
                  <TableHead className="text-right">MwSt.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/artikel/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                        {a.name}
                      </Link>
                      {a.description && <span className="block text-muted-foreground">{a.description}</span>}
                    </TableCell>
                    <TableCell>{a.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuro(toCents(a.unit_price_gross))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatVatRate(a.vat_rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card md:hidden">
            {articles.map((a) => (
              <li key={a.id}>
                <Link href={`/artikel/${a.id}`} className="flex min-h-11 items-baseline justify-between gap-4 px-4 py-3">
                  <span>
                    <span className="block font-medium">{a.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[a.unit, formatVatRate(a.vat_rate)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatEuro(toCents(a.unit_price_gross))}</span>
                </Link>
              </li>
            ))}
          </ul>
          {articles.length === LIST_LIMIT && (
            <p className="mt-3 text-sm text-muted-foreground">
              Es werden die ersten {LIST_LIMIT} Artikel angezeigt. Bitte die Suche verwenden.
            </p>
          )}
        </>
      )}
    </>
  )
}
