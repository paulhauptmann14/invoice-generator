'use client'

import { useActionState, useEffect, useRef } from 'react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type CreateTenantState, createFirstTenant } from '@/features/tenants/actions'

const initialState: CreateTenantState = { error: null, name: '' }

export function FirstTenantForm() {
  const [state, action, pending] = useActionState(createFirstTenant, initialState)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.error) inputRef.current?.focus()
  }, [state])

  return (
    <form action={action} noValidate className="space-y-5">
      <p className="text-sm text-muted-foreground">Lege deinen ersten Betrieb an. Kunden, Artikel und Rechnungen gehören immer zu einem Betrieb.</p>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name des Betriebs</Label>
        <Input
          ref={inputRef}
          id="name"
          name="name"
          defaultValue={state.name}
          maxLength={120}
          autoComplete="organization"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'name-error' : undefined}
        />
        {state.error && <FieldError id="name-error">{state.error}</FieldError>}
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? 'Wird angelegt …' : 'Betrieb anlegen'}
      </Button>
    </form>
  )
}
