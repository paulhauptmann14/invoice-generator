import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { CustomerForm } from '@/features/customers/customer-form'
import { requireMember } from '@/lib/auth/require-member'

export const metadata: Metadata = { title: 'Neuer Kunde' }

export default async function NewCustomerPage() {
  await requireMember()
  return (
    <>
      <PageHeader title="Neuer Kunde" />
      <CustomerForm id={null} initial={{ countryCode: 'DE' }} />
    </>
  )
}
