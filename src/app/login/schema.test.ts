import { expect, test } from 'vitest'
import { signInSchema } from './schema'

test('accepts valid credentials', () => {
  expect(signInSchema.safeParse({ email: 'a@b.de', password: 'x' }).success).toBe(true)
})
test('rejects an invalid email with a German message', () => {
  const r = signInSchema.safeParse({ email: 'kein-mail', password: 'x' })
  expect(r.success).toBe(false)
  expect(r.error?.issues[0].message).toBe('Bitte eine gültige E-Mail-Adresse eingeben.')
})
test('rejects an empty password with a German message', () => {
  const r = signInSchema.safeParse({ email: 'a@b.de', password: '' })
  expect(r.error?.issues[0].message).toBe('Bitte das Passwort eingeben.')
})
