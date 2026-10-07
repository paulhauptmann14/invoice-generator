import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { setCustomerArchived } from '@/features/customers/actions'
import { CustomerForm } from '@/features/customers/customer-form'
import { getCustomer } from '@/features/customers/queries'
import { requireMember } from '@/lib/auth/require-member'

export const metadata: Metadata = { title: 'Kunde bearbeiten' }

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireMember()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const customer = await getCustomer(supabase, id)
  if (!customer) notFound()

  const archived = customer.archived_at !== null
  return (
    <>
      <PageHeader
        title={customer.name}
        description={archived ? 'Archiviert – erscheint nicht in der Kundenauswahl.' : 'Kunde bearbeiten'}
        actions={
          <form action={setCustomerArchived.bind(null, customer.id, !archived)}>
            <Button type="submit" variant="outline">
              {archived ? 'Wiederherstellen' : 'Archivieren'}
            </Button>
          </form>
        }
      />
      <CustomerForm
        id={customer.id}
        initial={{
          name: customer.name,
          contactPerson: customer.contact_person ?? '',
          street: customer.street,
          postalCode: customer.postal_code,
          city: customer.city,
          countryCode: customer.country_code,
          email: customer.email ?? '',
          vatId: customer.vat_id ?? '',
          notes: customer.notes ?? '',
        }}
      />
    </>
  )
}
