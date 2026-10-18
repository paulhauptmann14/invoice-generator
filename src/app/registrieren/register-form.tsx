'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { FormAlert } from '@/components/form-alert'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type RegisterState, register } from '@/features/auth/register-actions'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/schemas'

const initialState: RegisterState = { message: null, existing: false, errors: {}, email: '' }

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, initialState)
  const [visible, setVisible] = useState(false)
  const alertRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  // After a failed submit, move focus to the first problem so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (state.errors.email) emailRef.current?.focus()
    else if (state.errors.password) passwordRef.current?.focus()
    else if (state.errors.confirm) confirmRef.current?.focus()
    else if (state.message) alertRef.current?.focus()
  }, [state])

  return (
    <form action={action} noValidate className="space-y-5">
      {state.message && (
        <FormAlert ref={alertRef}>
          {state.message}
          {state.existing && (
            <>
              {' '}
              <Link href="/login" className="underline underline-offset-4">
                Zur Anmeldung
              </Link>
            </>
          )}
        </FormAlert>
      )}

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
          aria-invalid={Boolean(state.errors.email)}
          aria-describedby={state.errors.email ? 'email-error' : undefined}
        />
        {state.errors.email && <FieldError id="email-error">{state.errors.email}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="new-password"
          required
          visible={visible}
          onToggle={() => setVisible((v) => !v)}
          aria-invalid={Boolean(state.errors.password)}
          aria-describedby={state.errors.password ? 'password-hint password-error' : 'password-hint'}
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          Mindestens {MIN_PASSWORD_LENGTH} Zeichen.
        </p>
        {state.errors.password && <FieldError id="password-error">{state.errors.password}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Passwort wiederholen</Label>
        <PasswordInput
          ref={confirmRef}
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          visible={visible}
          onToggle={() => setVisible((v) => !v)}
          aria-invalid={Boolean(state.errors.confirm)}
          aria-describedby={state.errors.confirm ? 'confirm-error' : undefined}
        />
        {state.errors.confirm && <FieldError id="confirm-error">{state.errors.confirm}</FieldError>}
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? 'Konto wird angelegt …' : 'Konto anlegen'}
      </Button>
    </form>
  )
}
