import { describe, expect, test } from 'vitest'
import { config as proxyConfig } from '@/proxy'
import { securityHeaders, staticFileCsp, staticFileSources } from './security-headers'

const get = (key: string) => securityHeaders.find((h) => h.key === key)?.value

describe('securityHeaders', () => {
  test('sets HSTS for two years including subdomains', () => {
    expect(get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains')
  })
  test('prevents MIME sniffing', () => {
    expect(get('X-Content-Type-Options')).toBe('nosniff')
  })
  test('allows framing only from the same origin (PDF preview iframe)', () => {
    expect(get('X-Frame-Options')).toBe('SAMEORIGIN')
  })
  test('sets restrictive referrer and permissions policies', () => {
    expect(get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  })
})

describe('staticFileCsp', () => {
  test('lets nothing run and nothing load from elsewhere', () => {
    const directives = staticFileCsp.split('; ')
    expect(directives).toContain("default-src 'none'")
    expect(directives).toContain('sandbox')
    expect(staticFileCsp).not.toMatch(/script-src|unsafe-eval|https?:/)
  })
  test('keeps the inline styles of the app icon (icon.svg)', () => {
    expect(staticFileCsp).toContain("style-src 'self' 'unsafe-inline'")
  })
})

describe('staticFileSources', () => {
  // Every response gets exactly one policy: the proxy's nonce policy or this fixed one, never both or none.
  const extensions = (pattern: string) => /\.\(\?:([a-z0-9|?]+)\)/.exec(pattern)?.[1]
  test('cover the same file types the proxy skips', () => {
    const [matcher] = proxyConfig.matcher
    expect(extensions(staticFileSources.at(-1)!)).toBe(extensions(matcher))
    expect(extensions(matcher)).toBe('svg|png|jpg|jpeg|gif|webp|ico|woff2?')
  })
  test('cover the build assets and the image optimizer the proxy skips', () => {
    expect(proxyConfig.matcher[0]).toContain('_next/static|_next/image|favicon.ico')
    expect(staticFileSources).toEqual(expect.arrayContaining(['/_next/static/:path*', '/_next/image']))
  })
})
