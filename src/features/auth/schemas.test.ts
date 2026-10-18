import { describe, expect, test } from 'vitest'
import { loginNotice, newPasswordSchema, resetRequestSchema } from './schemas'

describe('resetRequestSchema', () => {
  test('accepts and trims an e-mail address', () => expect(resetRequestSchema.parse({ email: ' a@b.de ' }).email).toBe('a@b.de'))
  test('rejects an invalid address in German', () => {
    expect(resetRequestSchema.safeParse({ email: 'kein-mail' }).error?.issues[0].message).toBe('Bitte eine gültige E-Mail-Adresse eingeben.')
  })
})

describe('newPasswordSchema', () => {
  test('accepts two equal passwords with at least 12 characters', () => {
    expect(newPasswordSchema.safeParse({ password: 'x'.repeat(12), confirm: 'x'.repeat(12) }).success).toBe(true)
  })
  test('rejects short passwords at the password field', () => {
    const issue = newPasswordSchema.safeParse({ password: 'kurz', confirm: 'kurz' }).error?.issues[0]
    expect(issue).toMatchObject({ path: ['password'], message: 'Mindestens 12 Zeichen.' })
  })
  test('rejects different passwords at the confirmation field', () => {
    const issue = newPasswordSchema.safeParse({ password: 'a'.repeat(12), confirm: 'b'.repeat(12) }).error?.issues[0]
    expect(issue).toMatchObject({ path: ['confirm'], message: 'Die Passwörter stimmen nicht überein.' })
  })
})

describe('loginNotice', () => {
  test('the invalid-link notice', () => {
    expect(loginNotice('link-ungueltig')).toEqual({ kind: 'error', text: 'Der Link ist abgelaufen oder ungültig. Bitte erneut anfordern.' })
  })
  test('anything else shows nothing', () => {
    expect(loginNotice(undefined)).toBeNull()
    expect(loginNotice('<script>')).toBeNull()
    expect(loginNotice(['link-ungueltig'])).toBeNull()
  })
})
