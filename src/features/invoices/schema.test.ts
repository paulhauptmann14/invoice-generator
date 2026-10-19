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
  test('payment days are optional: empty means no due date', () => {
    expect(invoiceSchema.parse({ ...base, paymentDays: '' }).paymentDays).toBeNull()
    expect(invoiceSchema.parse({ ...base, paymentDays: '  ' }).paymentDays).toBeNull()
    expect(invoiceSchema.parse({ ...base, paymentDays: '0' }).paymentDays).toBe(0)
    expect(pathErrorsFrom(invoiceSchema.safeParse({ ...base, paymentDays: 'x' }).error!)).toEqual({ paymentDays: 'Bitte 0 bis 365 Tage eingeben.' })
  })
})

describe('invoiceSchema discounts', () => {
  const buffet = { ...item, quantity: '20' } // 20 x 24,90 = 498,00
  const withItemDiscount = (discount: unknown, overrides: Record<string, unknown> = {}) => ({
    ...base,
    items: [{ ...buffet, discount, ...overrides }],
  })
  const errorsOf = (input: unknown) => pathErrorsFrom(invoiceSchema.safeParse(input).error!)

  test('no discount (null or missing) passes and parses to null', () => {
    const r = invoiceSchema.parse({ ...base, discount: null, items: [{ ...item, discount: null }] })
    expect(r.discount).toBeNull()
    expect(r.items[0].discount).toBeNull()
    const missing = invoiceSchema.parse(base)
    expect(missing.discount).toBeNull()
    expect(missing.items[0].discount).toBeNull()
  })
  test('item percent discount is parsed to a number', () => {
    expect(invoiceSchema.parse(withItemDiscount({ kind: 'percent', value: '10' })).items[0].discount).toEqual({ kind: 'percent', value: 10 })
    expect(invoiceSchema.parse(withItemDiscount({ kind: 'percent', value: '12,5' })).items[0].discount).toEqual({ kind: 'percent', value: 12.5 })
    expect(invoiceSchema.parse(withItemDiscount({ kind: 'percent', value: '100' })).items[0].discount).toEqual({ kind: 'percent', value: 100 })
  })
  test('item amount discount accepts comma and point', () => {
    expect(invoiceSchema.parse(withItemDiscount({ kind: 'amount', value: '49,80' })).items[0].discount).toEqual({ kind: 'amount', value: 49.8 })
    expect(invoiceSchema.parse(withItemDiscount({ kind: 'amount', value: '49.8' })).items[0].discount).toEqual({ kind: 'amount', value: 49.8 })
    expect(invoiceSchema.parse(withItemDiscount({ kind: 'amount', value: '498' })).items[0].discount).toEqual({ kind: 'amount', value: 498 })
  })
  test('percent must be between 0,01 and 100', () => {
    for (const value of ['0', '100,01', '-5', '150']) {
      expect(errorsOf(withItemDiscount({ kind: 'percent', value }))).toEqual({ 'items.0.discount': 'Rabatt: 0,01 bis 100 %.' })
    }
  })
  test('an empty value asks for a value or removal', () => {
    expect(errorsOf(withItemDiscount({ kind: 'percent', value: '' }))).toEqual({
      'items.0.discount': 'Bitte einen Rabatt eingeben oder den Rabatt entfernen.',
    })
    expect(errorsOf({ ...base, discount: { kind: 'amount', value: '  ' } })).toEqual({
      discount: 'Bitte einen Rabatt eingeben oder den Rabatt entfernen.',
    })
  })
  test('rejects unreadable values, more than two decimals and amounts of 0', () => {
    expect(errorsOf(withItemDiscount({ kind: 'amount', value: 'abc' }))['items.0.discount']).toBe('Bitte einen Rabatt wie 10 oder 12,5 eingeben.')
    expect(errorsOf(withItemDiscount({ kind: 'percent', value: '10,555' }))['items.0.discount']).toBe('Höchstens zwei Nachkommastellen.')
    expect(errorsOf(withItemDiscount({ kind: 'amount', value: '0' }))['items.0.discount']).toBe('Der Rabatt muss größer als 0 sein.')
  })
  test('item amount may not exceed the item amount', () => {
    expect(invoiceSchema.safeParse(withItemDiscount({ kind: 'amount', value: '498' })).success).toBe(true)
    expect(errorsOf(withItemDiscount({ kind: 'amount', value: '498,01' }))).toEqual({
      'items.0.discount': 'Der Rabatt ist höher als der Betrag der Position.',
    })
  })
  test('an item discount needs a positive item amount', () => {
    const message = 'Ein Rabatt ist nur bei Positionen mit positivem Betrag möglich.'
    expect(errorsOf(withItemDiscount({ kind: 'percent', value: '10' }, { unitPriceGross: '-5,00' }))).toEqual({ 'items.0.discount': message })
    expect(errorsOf(withItemDiscount({ kind: 'amount', value: '1' }, { unitPriceGross: '0' }))).toEqual({ 'items.0.discount': message })
  })
  test('invoice discount: percent and amount up to the subtotal', () => {
    expect(invoiceSchema.parse({ ...base, discount: { kind: 'percent', value: '5' } }).discount).toEqual({ kind: 'percent', value: 5 })
    // base: 2 x 24,90 = 49,80
    expect(invoiceSchema.parse({ ...base, discount: { kind: 'amount', value: '49,80' } }).discount).toEqual({ kind: 'amount', value: 49.8 })
    expect(errorsOf({ ...base, discount: { kind: 'amount', value: '49,81' } })).toEqual({ discount: 'Der Rabatt ist höher als die Zwischensumme.' })
    expect(errorsOf({ ...base, discount: { kind: 'percent', value: '100,01' } })).toEqual({ discount: 'Rabatt: 0,01 bis 100 %.' })
  })
  test('a fixed invoice discount on a zero subtotal is rejected, a percent discount is fine', () => {
    const free = { ...item, unitPriceGross: '0' }
    expect(errorsOf({ ...base, items: [free], discount: { kind: 'amount', value: '0,01' } })).toEqual({
      discount: 'Der Rabatt ist höher als die Zwischensumme.',
    })
    expect(invoiceSchema.safeParse({ ...base, items: [free], discount: { kind: 'percent', value: '10' } }).success).toBe(true)
  })
  test('the invoice amount limit is the subtotal after item discounts', () => {
    // 20 x 24,90 = 498,00, minus 10 % = 448,20
    const items = [{ ...buffet, discount: { kind: 'percent', value: '10' } }]
    expect(invoiceSchema.safeParse({ ...base, items, discount: { kind: 'amount', value: '448,20' } }).success).toBe(true)
    expect(errorsOf({ ...base, items, discount: { kind: 'amount', value: '448,21' } })).toEqual({
      discount: 'Der Rabatt ist höher als die Zwischensumme.',
    })
  })
  test('an invoice discount is blocked only by a negative item amount', () => {
    const message = 'Ein Rabatt auf die Rechnung ist nur möglich, wenn keine Position einen negativen Betrag hat.'
    const refund = { ...item, description: 'Pfand', unitPriceGross: '-5,00' }
    expect(errorsOf({ ...base, items: [item, refund], discount: { kind: 'percent', value: '5' } })).toEqual({ discount: message })
    // a 100 % item discount leaves 0 on that line, which is allowed
    const free = { ...item, discount: { kind: 'percent', value: '100' } }
    expect(invoiceSchema.safeParse({ ...base, items: [item, free], discount: { kind: 'amount', value: '1' } }).success).toBe(true)
    // so is a line of 0,00 EUR
    const zero = { ...item, description: 'Gratis', unitPriceGross: '0' }
    expect(invoiceSchema.safeParse({ ...base, items: [item, zero], discount: { kind: 'percent', value: '5' } }).success).toBe(true)
    // without an invoice discount, negative prices stay allowed
    expect(invoiceSchema.safeParse({ ...base, items: [item, refund] }).success).toBe(true)
  })
})
