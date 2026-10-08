import { Copy } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { InvoiceNumber } from '@/components/invoice-number'
import { PageHeader } from '@/components/page-header'
import { StatusBanner } from '@/components/status-banner'
import { Button } from '@/components/ui/button'
import { loadDocumentSettings } from '@/features/documents/load-document-data'
import { copyInvoice } from '@/features/invoices/actions'
import { ArchiveList } from '@/features/invoices/archive-list'
import { DeleteInvoiceButton } from '@/features/invoices/delete-invoice-button'
import { draftFromInvoice } from '@/features/invoices/draft'
import { InvoiceEditorProvider } from '@/features/invoices/editor-context'
import { ExportPanel } from '@/features/invoices/export-panel'
import { listExports } from '@/features/invoices/exports-queries'
import { InvoiceForm } from '@/features/invoices/invoice-form'
import { getInvoice, getInvoiceSettings, listArticleChoices, listCustomerChoices, listInvoiceNumbers } from '@/features/invoices/queries'
import { requireMember } from '@/lib/auth/require-member'
import { buildFilename } from '@/lib/domain/filename'

export const metadata: Metadata = { title: 'Rechnung bearbeiten' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function EditInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { supabase } = await requireMember()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const [invoice, settings, documentSettings, exports, numbers, customers, articles, query] = await Promise.all([
    getInvoice(supabase, id),
    getInvoiceSettings(supabase),
    loadDocumentSettings(supabase),
    listExports(supabase, id),
    listInvoiceNumbers(supabase),
    listCustomerChoices(supabase),
    listArticleChoices(supabase),
    searchParams,
  ])
  if (!invoice) notFound()

  const recipientName = invoice.recipient && typeof (invoice.recipient as { name?: unknown }).name === 'string' ? (invoice.recipient as { name: string }).name : ''
  const filenameContext = { customer: recipientName, number: invoice.number, issueDate: invoice.issue_date }
  const defaultFilenames = {
    pdf: buildFilename(documentSettings.filenameTemplate, filenameContext, 'pdf'),
    docx: buildFilename(documentSettings.filenameTemplate, filenameContext, 'docx'),
  }

  // The invoice's own number must not count as "taken" when re-suggesting.
  const numberContext = { format: settings.numberFormat, existing: numbers.filter((n) => n !== invoice.number) }
  return (
    <>
      <PageHeader
        title="Rechnung"
        description={recipientName || undefined}
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
      <InvoiceEditorProvider>
        <ExportPanel
          key={invoice.updated_at}
          invoiceId={invoice.id}
          defaultFilenames={defaultFilenames}
          missing={documentSettings.missing}
          leading={<InvoiceNumber number={invoice.number} size="lg" />}
        />
        {query.gespeichert && <StatusBanner>Rechnung gespeichert.</StatusBanner>}
        {query.kopiert && <StatusBanner>Kopie angelegt – mit neuer Nummer und heutigem Datum.</StatusBanner>}
        {/* key: a fresh form (and clean "unsaved changes" state) after every save */}
        <InvoiceForm key={invoice.updated_at} id={invoice.id} initialDraft={draftFromInvoice(invoice)} numberContext={numberContext} customers={customers} articles={articles} />
      </InvoiceEditorProvider>
      <ArchiveList invoiceId={invoice.id} exports={exports} />
    </>
  )
}
