// Nonce-based Content Security Policy, built per request in src/proxy.ts.

export type CspOptions = { nonce: string; isDev: boolean; isHttps: boolean }

export function buildCsp({ nonce, isDev, isHttps }: CspOptions): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    // In development React injects styles without a nonce; a nonce would disable 'unsafe-inline'.
    ['style-src', ["'self'", isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`]],
    // style="" attributes rendered by React cannot carry a nonce; they cannot execute code.
    ['style-src-attr', ["'unsafe-inline'"]],
    ['img-src', ["'self'", 'blob:', 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'"]],
    // blob: for the live PDF preview iframe
    ['frame-src', ["'self'", 'blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
  ]
  const parts = directives.map(([name, values]) => `${name} ${values.join(' ')}`)
  // Only over https: on http://localhost it would rewrite asset URLs to https and break the app.
  if (isHttps) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}
