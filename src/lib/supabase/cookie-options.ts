/**
 * Session cookie hardening. @supabase/ssr defaults to httpOnly: false so a browser client can read
 * the session; this app has no browser client, so the session is kept out of reach of page scripts.
 */
export function sessionCookieOptions(isHttps: boolean) {
  return { httpOnly: true, sameSite: 'lax', secure: isHttps, path: '/' } as const
}
