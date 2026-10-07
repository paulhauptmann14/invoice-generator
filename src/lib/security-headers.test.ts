import { describe, expect, test } from 'vitest'
import { securityHeaders } from './security-headers'

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
