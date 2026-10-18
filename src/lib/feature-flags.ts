/**
 * Runtime switches read on the server at request time (plain env var, not NEXT_PUBLIC_, so nothing is baked in at build time).
 * Callers are dynamic pages and server actions.
 */

/** The e-mail password reset is on unless `PASSWORD_RESET_EMAIL=off` (e.g. a self-hosted server without mail delivery). */
export function isPasswordResetEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PASSWORD_RESET_EMAIL !== 'off'
}
