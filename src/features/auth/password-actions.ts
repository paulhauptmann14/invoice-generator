'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isFreshRecovery, parseRecoveryLink, requestReset } from './recovery'
import { newPasswordSchema, resetRequestSchema } from './schemas'

const LINK_INVALID = '/login?hinweis=link-ungueltig'

export type ResetRequestState = { status: 'idle' | 'sent' | 'error'; fieldError: string | null; email: string }

/** Requests the reset e-mail. The answer is always the same (no account enumeration, also on rate limits). */
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = String(formData.get('email') ?? '')
  const parsed = resetRequestSchema.safeParse({ email })
  if (!parsed.success) return { status: 'error', fieldError: parsed.error.issues[0].message, email }

  const status = await requestReset(await createClient(), parsed.data.email)
  return { status, fieldError: null, email: parsed.data.email }
}

/**
 * Redeems the token of the e-mail link. Runs on a button click (POST), not when the link is opened:
 * mail scanners that prefetch links would otherwise use up the one-time token.
 */
export async function confirmRecovery(formData: FormData): Promise<void> {
  const tokenHash = parseRecoveryLink('recovery', formData.get('token_hash'))
  if (!tokenHash) redirect(LINK_INVALID)

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  if (error) {
    console.warn('Recovery link rejected', error.code ?? error.message)
    redirect(LINK_INVALID)
  }
  redirect('/passwort-neu')
}

export type NewPasswordState = { message: string | null; errors: { password?: string; confirm?: string } }

/** Sets the new password; only a fresh session from the e-mail link may do this (not a normal sign-in). */
export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const parsed = newPasswordSchema.safeParse({ password: String(formData.get('password') ?? ''), confirm: String(formData.get('confirm') ?? '') })
  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors
    return { message: null, errors: { password: fields.password?.[0], confirm: fields.confirm?.[0] } }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!isFreshRecovery(data?.claims)) redirect(LINK_INVALID)

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === 'same_password') return { message: null, errors: { password: 'Bitte ein anderes als das bisherige Passwort wählen.' } }
    if (error.code === 'weak_password') return { message: null, errors: { password: 'Dieses Passwort ist zu schwach. Bitte ein längeres wählen.' } }
    console.error('Setting new password failed', error.code ?? error.message)
    return { message: 'Das Passwort konnte nicht geändert werden. Bitte den Link erneut anfordern.', errors: {} }
  }
  // Sessions elsewhere (e.g. a stolen or forgotten one) end with the old password.
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
  if (signOutError) console.warn('Signing out other sessions failed', signOutError.code ?? signOutError.message)
  redirect('/')
}
