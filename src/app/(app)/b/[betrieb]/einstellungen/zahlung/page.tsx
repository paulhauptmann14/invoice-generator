import type { Metadata } from 'next'
import { StatusBanner } from '@/components/status-banner'
import { paymentFormValues } from '@/features/settings/merge'
import { PaymentForm } from '@/features/settings/payment-form'
import { loadSettings } from '@/features/settings/repository'
import { requireTenant } from '@/lib/auth/require-tenant'

export const metadata: Metadata = { title: 'Zahlung · Einstellungen' }

type Props = { params: Promise<{ betrieb: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function PaymentSettingsPage({ params, searchParams }: Props) {
  const { supabase, tenant } = await requireTenant((await params).betrieb)
  const [settings, query] = await Promise.all([loadSettings(supabase, tenant.id), searchParams])
  return (
    <>
      {query.gespeichert && <StatusBanner>Zahlungsangaben gespeichert.</StatusBanner>}
      <PaymentForm key={`payment-${settings.updatedAt}`} initial={paymentFormValues(settings.company, settings.theme, settings.defaultPaymentDays)} />
    </>
  )
}
