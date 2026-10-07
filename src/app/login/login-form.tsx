'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'
import { FieldError } from '@/components/field-error'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, type SignInState } from './actions'

const initialState: SignInState = { error: null, fieldErrors: {}, email: '' }

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState)
  const [showPassword, setShowPassword] = useState(false)
  const alertRef = useRef<HTMLDivElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // After a failed submit, move focus to the first problem so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (state.fieldErrors.email) emailRef.current?.focus()
    else if (state.fieldErrors.password) passwordRef.current?.focus()
    else if (state.error) alertRef.current?.focus()
  }, [state])

  return (
    <form action={action} noValidate className="space-y-5">
      {state.error && <FormAlert ref={alertRef}>{state.error}</FormAlert>}

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
          aria-invalid={Boolean(state.fieldErrors.email)}
          aria-describedby={state.fieldErrors.email ? 'email-error' : undefined}
        />
        {state.fieldErrors.email && <FieldError id="email-error">{state.fieldErrors.email}</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <div className="relative">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className="pr-12"
            aria-invalid={Boolean(state.fieldErrors.password)}
            aria-describedby={state.fieldErrors.password ? 'password-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
        {state.fieldErrors.password && <FieldError id="password-error">{state.fieldErrors.password}</FieldError>}
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={pending} aria-busy={pending}>
        {pending ? 'Anmelden …' : 'Anmelden'}
      </Button>
    </form>
  )
}
