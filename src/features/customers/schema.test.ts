import { describe, expect, test } from 'vitest'
import { customerSchema } from './schema'

const base = { name: 'Müller GmbH', contactPerson: '', street: '', postalCode: '', city: '', countryCode: 'DE', email: '', vatId: '', notes: '' }

describe('customerSchema', () => {
  test('only the name is required; empty optional fields become null', () => {
    const r = customerSchema.parse(base)
    expect(r).toMatchObject({ name: 'Müller GmbH', contactPerson: null, email: null, vatId: null, notes: null, street: '' })
  })
  test('rejects an empty name with a German message', () => {
    const r = customerSchema.safeParse({ ...base, name: '  ' })
    expect(r.error?.issues[0]).toMatchObject({ path: ['name'], message: 'Bitte einen Namen eingeben.' })
  })
  test('validates email', () => {
    const r = customerSchema.safeParse({ ...base, email: 'kein-mail' })
    expect(r.error?.issues[0]).toMatchObject({ path: ['email'], message: 'Bitte eine gültige E-Mail-Adresse eingeben.' })
  })
  test('normalizes and validates the VAT ID', () => {
    expect(customerSchema.parse({ ...base, vatId: 'de 123 456 789' }).vatId).toBe('DE123456789')
    const r = customerSchema.safeParse({ ...base, vatId: '123' })
    expect(r.error?.issues[0]).toMatchObject({ path: ['vatId'], message: 'USt-IdNr. im Format DE123456789 eingeben.' })
  })
  test('requires a two-letter country code', () => {
    const r = customerSchema.safeParse({ ...base, countryCode: '' })
    expect(r.error?.issues[0]).toMatchObject({ path: ['countryCode'], message: 'Bitte ein Land auswählen.' })
  })
})
