import { describe, expect, test } from 'vitest'
import { isPublicPath, redirectsWhenSignedIn } from './public-paths'

describe('isPublicPath', () => {
  test.each(['/login', '/passwort-vergessen', '/auth/bestaetigen', '/kein-zugriff', '/passwort-neu'])('%s is not redirected by the proxy', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })
  test.each(['/', '/b/c0000000-0000-4000-8000-000000000001/rechnungen', '/api/b/x/invoices/preview', '/login/x', '/loginx'])(
    '%s needs a session',
    (path) => expect(isPublicPath(path)).toBe(false),
  )
})

describe('redirectsWhenSignedIn', () => {
  test('signed-in users skip the login and the reset request', () => {
    expect(redirectsWhenSignedIn('/login')).toBe(true)
    expect(redirectsWhenSignedIn('/passwort-vergessen')).toBe(true)
  })
  test('other public pages stay reachable', () => {
    expect(redirectsWhenSignedIn('/auth/bestaetigen')).toBe(false)
    expect(redirectsWhenSignedIn('/kein-zugriff')).toBe(false)
  })
})
