import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { CustomerForm } from '@/features/customers/customer-form'
import { requireTenant } from '@/lib/auth/require-tenant'

export const metadata: Metadata = { title: 'Neuer Kunde' }

export default async function NewCustomerPage({ params }: { params: Promise<{ betrieb: string }> }) {
  await requireTenant((await params).betrieb)
  return (
    <>
      <PageHeader title="Neuer Kunde" />
      <CustomerForm id={null} initial={{ countryCode: 'DE' }} />
    </>
  )
}
