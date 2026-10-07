import { Copy } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { InvoiceNumberStamp } from '@/components/invoice-number-stamp'
import { PageHeader } from '@/components/page-header'
import { StatusBanner } from '@/components/status-banner'
import { Button } from '@/components/ui/button'
import { copyInvoice } from '@/features/invoices/actions'
import { DeleteInvoiceButton } from '@/features/invoices/delete-invoice-button'
import { draftFromInvoice } from '@/features/invoices/draft'
import { InvoiceForm } from '@/features/invoices/invoice-form'
import { getInvoice, getInvoiceSettings, listArticleChoices, listCustomerChoices, listInvoiceNumbers } from '@/features/invoices/queries'
import { requireMember } from '@/lib/auth/require-member'

export const metadata: Metadata = { title: 'Rechnung bearbeiten' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function EditInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { supabase } = await requireMember()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const [invoice, settings, numbers, customers, articles, query] = await Promise.all([
    getInvoice(supabase, id),
    getInvoiceSettings(supabase),
    listInvoiceNumbers(supabase),
    listCustomerChoices(supabase),
    listArticleChoices(supabase),
    searchParams,
  ])
  if (!invoice) notFound()

  // The invoice's own number must not count as "taken" when re-suggesting.
  const numberContext = { format: settings.numberFormat, existing: numbers.filter((n) => n !== invoice.number) }
  return (
    <>
      <PageHeader
        title="Rechnung"
        description={invoice.recipient && typeof (invoice.recipient as { name?: unknown }).name === 'string' ? (invoice.recipient as { name: string }).name : undefined}
        actions={
          <>
            <form action={copyInvoice.bind(null, invoice.id)}>
              <Button type="submit" variant="outline" className="gap-2">
                <Copy aria-hidden className="size-4" />
                Kopieren
              </Button>
            </form>
            <DeleteInvoiceButton id={invoice.id} number={invoice.number} />
          </>
        }
      />
      <div className="mt-4">
        <InvoiceNumberStamp number={invoice.number} size="lg" />
      </div>
      {query.gespeichert && <StatusBanner>Rechnung gespeichert.</StatusBanner>}
      {query.kopiert && <StatusBanner>Kopie angelegt – mit neuer Nummer und heutigem Datum.</StatusBanner>}
      {/* key: a fresh form (and clean "unsaved changes" state) after every save */}
      <InvoiceForm key={invoice.updated_at} id={invoice.id} initialDraft={draftFromInvoice(invoice)} numberContext={numberContext} customers={customers} articles={articles} />
    </>
  )
}
