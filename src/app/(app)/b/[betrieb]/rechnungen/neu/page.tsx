import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { newDraft } from '@/features/invoices/draft'
import { InvoiceForm } from '@/features/invoices/invoice-form'
import { getInvoiceSettings, listArticleChoices, listCustomerChoices, listInvoiceNumbers, listNumberRanges } from '@/features/invoices/queries'
import { requireTenant } from '@/lib/auth/require-tenant'
import { todayIso } from '@/lib/domain/dates'

export const metadata: Metadata = { title: 'Neue Rechnung' }

export default async function NewInvoicePage({ params }: { params: Promise<{ betrieb: string }> }) {
  const { supabase, tenant } = await requireTenant((await params).betrieb)
  const [settings, ranges, numbers, customers, articles] = await Promise.all([
    getInvoiceSettings(supabase, tenant.id),
    listNumberRanges(supabase, tenant.id),
    listInvoiceNumbers(supabase, tenant.id),
    listCustomerChoices(supabase, tenant.id),
    listArticleChoices(supabase, tenant.id),
  ])
  const numberContext = { ranges, existing: numbers }
  const draft = newDraft({
    today: todayIso(),
    numberContext,
    paymentDays: settings.defaultPaymentDays,
    introText: settings.theme.texts.intro,
    closingText: settings.theme.texts.closing,
  })
  return (
    <>
      <PageHeader title="Neue Rechnung" />
      <InvoiceForm id={null} initialDraft={draft} numberContext={numberContext} customers={customers} articles={articles} />
    </>
  )
}
