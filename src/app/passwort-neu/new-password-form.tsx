'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { FormAlert } from '@/components/form-alert'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { type NewPasswordState, setNewPassword } from '@/features/auth/password-actions'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/schemas'

const initialState: NewPasswordState = { message: null, errors: {} }

export function NewPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(setNewPassword, initialState)
  const [visible, setVisible] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (state.errors.password) passwordRef.current?.focus()
    else if (state.errors.confirm) confirmRef.current?.focus()
    else if (state.message) alertRef.current?.focus()
  }, [state])

  return (
    <form action={action} noValidate className="space-y-5">
      {state.message && <FormAlert ref={alertRef}>{state.message}</FormAlert>}
      <p className="text-sm text-muted-foreground">
        Für das Konto <span className="font-medium break-all text-foreground">{email}</span>
      </p>
      {/* Lets password managers store the new password for the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="space-y-1.5">
        <Label htmlFor="password">Neues Passwort</Label>
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
        <Label htmlFor="confirm">Neues Passwort wiederholen</Label>
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
        {pending ? 'Wird gespeichert …' : 'Passwort speichern'}
      </Button>
    </form>
  )
}
