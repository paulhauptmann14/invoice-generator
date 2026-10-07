import { describe, expect, test } from 'vitest'
import { pathErrorsFrom } from '@/lib/form'
import { invoiceSchema } from './schema'

const item = { description: 'Buffet', quantity: '2', unit: 'Pers.', unitPriceGross: '24,90', vatRate: '7', articleId: null, saveAsArticle: false }
const base = {
  number: '2026-0001',
  customerId: null,
  saveAsCustomer: false,
  recipient: { name: 'Müller GmbH', contactPerson: '', street: '', postalCode: '', city: '', countryCode: 'DE', vatId: '' },
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: '14',
  introText: '',
  closingText: '',
  items: [item],
}

describe('invoiceSchema', () => {
  test('parses a minimal valid invoice', () => {
    const r = invoiceSchema.parse(base)
    expect(r.paymentDays).toBe(14)
    expect(r.items[0]).toMatchObject({ quantity: 2, unitPriceGross: 24.9, vatRate: 7 })
    expect(r.recipient).toMatchObject({ contactPerson: null, vatId: null })
    expect(r.introText).toBeNull()
  })
  test('collects nested errors by path', () => {
    const r = invoiceSchema.safeParse({
      ...base,
      number: ' ',
      recipient: { ...base.recipient, name: '' },
      items: [item, { ...item, quantity: '0', unitPriceGross: 'x' }],
    })
    expect(pathErrorsFrom(r.error!)).toEqual({
      number: 'Bitte eine Rechnungsnummer eingeben.',
      'recipient.name': 'Bitte einen Namen eingeben.',
      'items.1.quantity': 'Die Menge darf nicht 0 sein.',
      'items.1.unitPriceGross': 'Bitte einen Preis wie 24,90 eingeben.',
    })
  })
  test('requires at least one item', () => {
    expect(pathErrorsFrom(invoiceSchema.safeParse({ ...base, items: [] }).error!)).toEqual({
      items: 'Bitte mindestens eine Position hinzufügen.',
    })
  })
  test('service period end must not precede the start', () => {
    const r = invoiceSchema.safeParse({ ...base, serviceDateFrom: '2026-10-07', serviceDateTo: '2026-10-01' })
    expect(pathErrorsFrom(r.error!)).toEqual({ serviceDateTo: 'Das Ende darf nicht vor dem Beginn liegen.' })
  })
  test('validates dates and payment days', () => {
    const r = invoiceSchema.safeParse({ ...base, issueDate: '2026-02-30', paymentDays: '400' })
    expect(pathErrorsFrom(r.error!)).toEqual({
      issueDate: 'Bitte ein gültiges Rechnungsdatum wählen.',
      paymentDays: 'Bitte 0 bis 365 Tage eingeben.',
    })
  })
})
