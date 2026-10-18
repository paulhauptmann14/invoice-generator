// Pages the proxy lets through without a session. Everything else requires one (proxy redirect, and
// every page/action/route checks again by itself – the proxy is not a security boundary).
// /passwort-neu checks the session itself to show "link expired" instead of a bare login redirect.
const PUBLIC_PATHS = new Set(['/login', '/passwort-vergessen', '/auth/bestaetigen', '/kein-zugriff', '/passwort-neu'])

/** Signed-in users opening these pages are sent into the app instead. */
const SIGNED_IN_REDIRECTS = new Set(['/login', '/passwort-vergessen'])

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname)
}

export function redirectsWhenSignedIn(pathname: string): boolean {
  return SIGNED_IN_REDIRECTS.has(pathname)
}
