'use server'

import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { isRegistrationEnabled } from '@/lib/feature-flags'
import { createClient } from '@/lib/supabase/server'
import { registerSchema } from './schemas'

export type RegisterState = {
  /** Form-level message (shown as an alert). */
  message: string | null
  /** The address already has an account: the form adds a link to the login. */
  existing: boolean
  errors: { email?: string; password?: string; confirm?: string }
  email: string
}

/** Creates an account (auto-confirmed, so a session results) and opens the welcome page. */
export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!isRegistrationEnabled()) notFound()
  const email = String(formData.get('email') ?? '')
  const parsed = registerSchema.safeParse({ email, password: String(formData.get('password') ?? ''), confirm: String(formData.get('confirm') ?? '') })
  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors
    return { message: null, existing: false, errors: { email: fields.email?.[0], password: fields.password?.[0], confirm: fields.confirm?.[0] }, email }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password })
  const state = { message: null, existing: false, errors: {}, email: parsed.data.email }
  if (error) {
    switch (error.code) {
      case 'user_already_exists':
      case 'email_exists':
        return { ...state, existing: true, message: 'Für diese Adresse gibt es schon ein Konto – bitte anmelden.' }
      case 'weak_password':
        return { ...state, errors: { password: 'Dieses Passwort ist zu schwach. Bitte ein längeres wählen.' } }
      case 'signup_disabled':
        return { ...state, message: 'Die Registrierung ist ausgeschaltet.' }
      default:
        console.error('Sign-up failed', error.code ?? 'unknown')
        return { ...state, message: 'Das Konto konnte nicht angelegt werden. Bitte erneut versuchen.' }
    }
  }
  redirect(data.session ? '/willkommen' : '/login')
}
