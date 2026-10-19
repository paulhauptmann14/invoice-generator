export const securityHeaders: { key: string; value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
]

/**
 * Fixed policy for the files the proxy skips (build assets, images, icons, fonts), which therefore get no
 * per-request nonce policy. Opened on their own, e.g. an SVG, nothing may run or load from elsewhere.
 * Inline styles stay allowed for the app icon (icon.svg); 'self' styles and fonts keep Next's 404 page
 * readable when such a path does not exist.
 */
export const staticFileCsp = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  'sandbox',
].join('; ')

/**
 * next.config `headers()` sources for staticFileCsp. They mirror the exclusions of the proxy matcher
 * (src/proxy.ts, which must stay a literal), so every response gets exactly one policy.
 */
export const staticFileSources = ['/_next/static/:path*', '/_next/image', '/:path(.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?))']
