import { describe, expect, test } from 'vitest'
import type { InvoiceRecordWithItems } from './draft'
import { invoiceGrossCents, missingRecipientAddress, missingRecipientAddressOf, recipientAddressMessage } from './recipient-address'

const full = { name: 'Müller GmbH', street: 'Hauptstr. 1', postalCode: '80331', city: 'München' }

describe('missingRecipientAddress', () => {
  test('up to and including 250,00 EUR no address is needed', () => {
    expect(missingRecipientAddress({ name: 'Müller GmbH' }, 25000)).toEqual([])
    expect(missingRecipientAddress({}, 0)).toEqual([])
  })
  test('above 250,00 EUR all empty address fields are reported in order', () => {
    expect(missingRecipientAddress({ name: 'Müller GmbH' }, 25001)).toEqual(['Straße', 'PLZ', 'Ort'])
    expect(missingRecipientAddress({ ...full, street: '  ' }, 25001)).toEqual(['Straße'])
    expect(missingRecipientAddress({ ...full, postalCode: '' }, 25001)).toEqual(['PLZ'])
    expect(missingRecipientAddress({ ...full, city: '' }, 25001)).toEqual(['Ort'])
  })
  test('a complete address passes at any amount', () => {
    expect(missingRecipientAddress(full, 1_000_000)).toEqual([])
  })
  test('the magnitude counts, and unreadable recipients count as empty', () => {
    expect(missingRecipientAddress({}, -25001)).toEqual(['Straße', 'PLZ', 'Ort'])
    expect(missingRecipientAddress(null, 25001)).toEqual(['Straße', 'PLZ', 'Ort'])
    expect(missingRecipientAddress({ street: 5, postalCode: null, city: 'X' }, 25001)).toEqual(['Straße', 'PLZ'])
  })
  test('message names the fields', () => {
    expect(recipientAddressMessage(['Straße', 'PLZ', 'Ort'])).toBe('Empfängeranschrift unvollständig (Pflicht ab 250 €): Straße, PLZ, Ort.')
  })
})

describe('missingRecipientAddressOf', () => {
  const invoice = (recipient: unknown, price: number, discount?: { kind: string; value: number }): InvoiceRecordWithItems =>
    ({
      recipient,
      discount_kind: discount?.kind ?? null,
      discount_value: discount?.value ?? null,
      invoice_items: [{ quantity: 1, unit_price_gross: price, vat_rate: 7, discount_kind: null, discount_value: null }],
    }) as unknown as InvoiceRecordWithItems

  test('uses the gross total after the invoice discount', () => {
    expect(invoiceGrossCents(invoice({}, 300, { kind: 'amount', value: 60 }))).toBe(24000)
    // 300 EUR, minus 60 EUR = 240 EUR: small-amount invoice
    expect(missingRecipientAddressOf(invoice({ name: 'A' }, 300, { kind: 'amount', value: 60 }))).toEqual([])
    expect(missingRecipientAddressOf(invoice({ name: 'A' }, 300))).toEqual(['Straße', 'PLZ', 'Ort'])
    expect(missingRecipientAddressOf(invoice(full, 300))).toEqual([])
  })
})
