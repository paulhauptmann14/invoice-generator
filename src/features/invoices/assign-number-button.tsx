'use client'

import { Hash } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/features/tenants/tenant-context'
import { formatDateDe, todayIso } from '@/lib/domain/dates'
import { assignAllInvoiceNumbers, assignInvoiceNumber } from './actions'

/**
 * "Nummer vergeben": numbers one draft (`invoiceId`) or all drafts of the business (`count` of them). Asks first, because
 * a given number stays and the issue date becomes today.
 */
export function AssignNumberButton({ invoiceId, count, disabled, primary }: { invoiceId?: string; count?: number; disabled?: boolean; primary?: boolean }) {
  const { tenant } = useTenant()
  const today = formatDateDe(todayIso())
  const all = invoiceId === undefined
  const action = all ? assignAllInvoiceNumbers.bind(null, tenant.id) : assignInvoiceNumber.bind(null, tenant.id, invoiceId)
  const label = all ? `Nummern vergeben (${count ?? 0})` : 'Nummer vergeben'
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={primary ? 'default' : 'outline'} className="gap-2" disabled={disabled}>
          <Hash aria-hidden className="size-4" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{all ? `${count === 1 ? 'Einem Entwurf' : `${count} Entwürfen`} Nummern vergeben?` : 'Nummer vergeben?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {all
              ? `Jeder Entwurf bekommt die nächste Nummer seines Nummernkreises, in der Reihenfolge des Leistungsdatums, und das Rechnungsdatum ${today}.`
              : `Die Rechnung bekommt die nächste Nummer ihres Nummernkreises und das Rechnungsdatum ${today}.`}{' '}
            Eine vergebene Nummer bleibt, sie lässt sich nicht zurücknehmen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <form action={action} className="w-full sm:w-auto">
            {/* Not AlertDialogAction: that would close the dialog on click and hide the pending state. */}
            <SubmitButton pendingLabel="Wird vergeben …" className="w-full sm:w-auto">
              {all ? 'Nummern vergeben' : 'Nummer vergeben'}
            </SubmitButton>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
