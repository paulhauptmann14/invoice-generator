import type { SupabaseClient } from '@supabase/supabase-js'

// Building blocks of the password reset flow (spec 3c), kept free of Next.js so they can be tested.

/** A session from the e-mail link may set a new password for this long (seconds). */
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60

// Token hashes are URL-safe; the PKCE flow of @supabase/ssr prefixes them with "pkce_".
const TOKEN_HASH = /^[A-Za-z0-9_-]{20,200}$/

/** The token hash of a valid recovery link, or null (other types, missing or malformed values). */
export function parseRecoveryLink(type: unknown, tokenHash: unknown): string | null {
  return type === 'recovery' && typeof tokenHash === 'string' && TOKEN_HASH.test(tokenHash) ? tokenHash : null
}

/**
 * True only for a session created by the e-mail link (amr method "otp") within the time window.
 * A normal sign-in (method "password") must not set a new password without the old one.
 */
export function isFreshRecovery(claims: unknown, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  const amr = (claims as { amr?: unknown } | null)?.amr
  if (!Array.isArray(amr)) return false
  return amr.some((entry: { method?: unknown; timestamp?: unknown }) => {
    return entry?.method === 'otp' && typeof entry.timestamp === 'number' && nowSeconds - entry.timestamp <= RECOVERY_MAX_AGE_SECONDS
  })
}

/**
 * Asks Supabase to send the reset e-mail and always reports "sent": unknown addresses, rate limits
 * (Supabase only rate-limits existing accounts) and other errors look the same from outside.
 */
export async function requestReset(supabase: SupabaseClient, email: string): Promise<'sent'> {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) console.warn('Password reset request not sent', error.code ?? error.status)
  return 'sent'
}
