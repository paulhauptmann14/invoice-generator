'use client'

import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/features/tenants/tenant-context'
import { deleteInvoice } from './actions'

export function DeleteInvoiceButton({ id, number }: { id: string; number: string }) {
  const { tenant } = useTenant()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Trash2 aria-hidden className="size-4" />
          Löschen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rechnung {number} löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Die Rechnung und alle dazu archivierten PDFs werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <form action={deleteInvoice.bind(null, tenant.id, id)} className="w-full sm:w-auto">
            <AlertDialogAction type="submit" variant="destructive" className="w-full sm:w-auto">
              Endgültig löschen
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
