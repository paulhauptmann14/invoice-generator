import type { Metadata } from 'next'
import { StatusBanner } from '@/components/status-banner'
import { CompanyForm } from '@/features/settings/company-form'
import { companyFormValues } from '@/features/settings/merge'
import { loadSettings } from '@/features/settings/repository'
import { requireTenant } from '@/lib/auth/require-tenant'

export const metadata: Metadata = { title: 'Firma · Einstellungen' }

type Props = { params: Promise<{ betrieb: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function CompanySettingsPage({ params, searchParams }: Props) {
  const { supabase, tenant } = await requireTenant((await params).betrieb)
  const [settings, query] = await Promise.all([loadSettings(supabase, tenant.id), searchParams])
  return (
    <>
      {query.gespeichert && <StatusBanner>Firmendaten gespeichert.</StatusBanner>}
      {/* key: a fresh form (and clean "unsaved changes" state) after every save */}
      <CompanyForm key={`company-${settings.updatedAt}`} initial={companyFormValues(settings.company, settings.tenantName)} />
    </>
  )
}
