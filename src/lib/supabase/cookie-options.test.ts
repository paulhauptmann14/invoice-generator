import { expect, test } from 'vitest'
import { sessionCookieOptions } from './cookie-options'

test('session cookies are hidden from JavaScript and not sent cross-site', () => {
  expect(sessionCookieOptions(false)).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' })
})
test('session cookies are https-only when served over https', () => {
  expect(sessionCookieOptions(true).secure).toBe(true)
})
