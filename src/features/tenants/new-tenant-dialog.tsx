'use client'

import { Plus } from 'lucide-react'
import { useActionState, useEffect, useId, useRef } from 'react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type CreateTenantState, createTenant } from './actions'

const initialState: CreateTenantState = { error: null, name: '' }

/** Lives inside the dialog content, so every opening starts with a fresh form state. */
function NewTenantForm() {
  const [state, action, pending] = useActionState(createTenant, initialState)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const errorId = useId()

  // After a rejected submit, put the focus back on the field that needs fixing.
  useEffect(() => {
    if (state.error) inputRef.current?.focus()
  }, [state])

  return (
    <form action={action} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>Name</Label>
        <Input
          ref={inputRef}
          id={inputId}
          name="name"
          defaultValue={state.name}
          maxLength={120}
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
        />
        {state.error && <FieldError id={errorId}>{state.error}</FieldError>}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pending}>
            Abbrechen
          </Button>
        </DialogClose>
        <Button type="submit" className="gap-2" disabled={pending} aria-busy={pending}>
          <Plus aria-hidden className="size-4" />
          {pending ? 'Wird angelegt …' : 'Betrieb anlegen'}
        </Button>
      </div>
    </form>
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opened from a menu item that is gone afterwards: focus goes back to this element instead. */
  returnFocusRef: React.RefObject<HTMLElement | null>
}

export function NewTenantDialog({ open, onOpenChange, returnFocusRef }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 p-5 sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <div className="space-y-1.5">
          <DialogTitle className="font-display text-xl font-semibold">Neuer Betrieb</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Eigene Kunden, Artikel, Rechnungen und Nummern. Firmendaten und Logo folgen in den Einstellungen.
          </DialogDescription>
        </div>
        <NewTenantForm />
      </DialogContent>
    </Dialog>
  )
}
