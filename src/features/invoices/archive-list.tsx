import { FileDown } from 'lucide-react'
import type { InvoiceExport } from './exports-queries'

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })

/** Archived PDF exports of an invoice, newest first; each entry downloads via a short-lived signed URL. */
export function ArchiveList({ invoiceId, exports }: { invoiceId: string; exports: InvoiceExport[] }) {
  return (
    <section aria-labelledby="archive-heading" className="mt-12 max-w-3xl">
      <h2 id="archive-heading" className="font-display text-xl font-semibold">
        Archivierte PDFs
      </h2>
      {exports.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Noch nicht exportiert.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {exports.map((e) => (
            <li key={e.id}>
              <a
                href={`/api/invoices/${invoiceId}/exports/${e.id}`}
                className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-muted"
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
