'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { signInSchema } from './schema'

export type SignInState = {
  error: string | null
  fieldErrors: { email?: string; password?: string }
  email: string
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const raw = {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  }
  const parsed = signInSchema.safeParse(raw)
  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors
    return { error: null, fieldErrors: { email: fields.email?.[0], password: fields.password?.[0] }, email: raw.email }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    // Generic message: never reveal whether an account exists.
    const message =
      error.status === 429
        ? 'Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut versuchen.'
        : 'E-Mail oder Passwort ist falsch.'
    return { error: message, fieldErrors: {}, email: raw.email }
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
