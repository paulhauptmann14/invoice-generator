import { describe, expect, test } from 'vitest'
import { buildCsp, createNonce } from './csp'

const directive = (csp: string, name: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name)

describe('buildCsp', () => {
  const prod = buildCsp({ nonce: 'abc', isDev: false, isHttps: true })

  test('scripts only with nonce and strict-dynamic in production', () => {
    expect(directive(prod, 'script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'")
  })
  test('styles use the nonce in production; inline style attributes stay allowed', () => {
    expect(directive(prod, 'style-src')).toBe("style-src 'self' 'nonce-abc'")
    expect(directive(prod, 'style-src-attr')).toBe("style-src-attr 'unsafe-inline'")
  })
  test('locks down connections, objects, framing and forms', () => {
    expect(directive(prod, 'default-src')).toBe("default-src 'self'")
    expect(directive(prod, 'connect-src')).toBe("connect-src 'self'")
    expect(directive(prod, 'object-src')).toBe("object-src 'none'")
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'self'")
    expect(directive(prod, 'form-action')).toBe("form-action 'self'")
    expect(directive(prod, 'base-uri')).toBe("base-uri 'self'")
  })
  test('upgrade-insecure-requests only over https', () => {
    expect(directive(prod, 'upgrade-insecure-requests')).toBeDefined()
    expect(directive(buildCsp({ nonce: 'abc', isDev: false, isHttps: false }), 'upgrade-insecure-requests')).toBeUndefined()
  })
  test('development allows eval and inline styles for React tooling', () => {
    const dev = buildCsp({ nonce: 'abc', isDev: true, isHttps: false })
    expect(directive(dev, 'script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'")
    expect(directive(dev, 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
  })
})

describe('createNonce', () => {
  test('is base64 and unique per call', () => {
    const a = createNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(createNonce()).not.toBe(a)
  })
})
