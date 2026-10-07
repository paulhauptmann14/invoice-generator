import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { newDraft } from '@/features/invoices/draft'
import { InvoiceForm } from '@/features/invoices/invoice-form'
import { getInvoiceSettings, listArticleChoices, listCustomerChoices, listInvoiceNumbers } from '@/features/invoices/queries'
import { requireMember } from '@/lib/auth/require-member'
import { todayIso } from '@/lib/domain/dates'

export const metadata: Metadata = { title: 'Neue Rechnung' }

export default async function NewInvoicePage() {
  const { supabase } = await requireMember()
  const [settings, numbers, customers, articles] = await Promise.all([
    getInvoiceSettings(supabase),
    listInvoiceNumbers(supabase),
    listCustomerChoices(supabase),
    listArticleChoices(supabase),
  ])
  const numberContext = { format: settings.numberFormat, existing: numbers }
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
