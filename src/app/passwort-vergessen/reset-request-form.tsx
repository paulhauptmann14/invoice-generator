'use client'

import { MailCheck } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset, type ResetRequestState } from '@/features/auth/password-actions'

const initialState: ResetRequestState = { status: 'idle', fieldError: null, email: '' }

function RequestForm({ onRestart }: { onRestart: () => void }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState)
  const emailRef = useRef<HTMLInputElement>(null)
  const sentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state.fieldError) emailRef.current?.focus()
    else if (state.status === 'sent') sentRef.current?.focus()
  }, [state])

  // Same answer whether or not an account exists for the address (no account enumeration).
  if (state.status === 'sent') {
    return (
      <div className="space-y-5">
        <div ref={sentRef} role="status" tabIndex={-1} className="space-y-3 text-sm outline-none">
          <p className="flex items-start gap-2 font-medium">
            <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            Falls zu dieser Adresse ein Konto existiert, ist eine E-Mail mit einem Link unterwegs.
          </p>
          <p className="text-muted-foreground">Der Link gilt eine Stunde. Keine E-Mail angekommen? Auch im Spam-Ordner nachsehen.</p>
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={onRestart}>
          Andere Adresse eingeben
        </Button>
      </div>
    )
  }

  return (
    <form action={action} noValidate className="space-y-5">
      <p className="text-sm text-muted-foreground">Für die angegebene Adresse kommt ein Link, über den sich ein neues Passwort festlegen lässt.</p>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          defaultValue={state.email}
          required
          aria-invalid={Boolean(state.fieldError)}
          aria-describedby={state.fieldError ? 'email-error' : undefined}
        />
        {state.fieldError && <FieldError id="email-error">{state.fieldError}</FieldError>}
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? 'Wird gesendet …' : 'Link anfordern'}
      </Button>
    </form>
  )
}

/** A new key starts a fresh request (e.g. after a typo in the address). */
export function ResetRequestForm() {
  const [attempt, setAttempt] = useState(0)
  return <RequestForm key={`request-${attempt}`} onRestart={() => setAttempt((a) => a + 1)} />
}
