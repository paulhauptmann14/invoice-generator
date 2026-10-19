import { FileDown } from 'lucide-react'
import { apiPath } from '@/lib/tenant-paths'
import type { InvoiceExport } from './exports-queries'

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })

/** Archived PDF exports of an invoice, newest first; each entry downloads through the app's export route. */
export function ArchiveList({ tenantId, invoiceId, exports }: { tenantId: string; invoiceId: string; exports: InvoiceExport[] }) {
  return (
    <section aria-labelledby="archive-heading" className="mt-12 max-w-3xl">
      <h2 id="archive-heading" className="type-title px-1">
        Archivierte PDFs
      </h2>
      {exports.length === 0 ? (
        <p className="mt-3 px-1 text-sm text-muted-foreground">Noch nicht exportiert.</p>
      ) : (
        <ul className="surface mt-3 divide-y divide-border overflow-hidden">
          {exports.map((e) => (
            <li key={e.id}>
              <a
                href={apiPath(tenantId, `invoices/${invoiceId}/exports/${e.id}`)}
                className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm focus-visible:-outline-offset-2 transition-colors duration-(--duration-fast) hover:bg-muted active:bg-pressed active:duration-0"
              >
                <FileDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 font-medium break-all">{e.filename}</span>
                <time dateTime={e.createdAt} className="text-muted-foreground tabular-nums">
                  {dateTime.format(new Date(e.createdAt))}
                </time>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
