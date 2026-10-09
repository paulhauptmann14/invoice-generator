import { describe, expect, test } from 'vitest'
import { inputFromInvoice, inputFromPayload } from './invoice-input'

describe('inputFromInvoice', () => {
  test('maps the stored record and sorts items', () => {
    const input = inputFromInvoice({
      number: '2026-0001',
      number_range_id: null,
      customer_id: null,
      recipient: { name: 'Müller', contactPerson: 'Max', street: 'Weg 1', postalCode: '1', city: 'Ort', countryCode: 'DE', vatId: 'DE1' },
      issue_date: '2026-10-07',
      service_date_from: '2026-10-07',
      service_date_to: null,
      payment_days: 14,
      intro_text: 'Hallo',
      closing_text: null,
      invoice_items: [
        { id: 'b', position: 1, description: 'B', quantity: 1, unit: '', unit_price_gross: 2, vat_rate: 19, article_id: null },
        { id: 'a', position: 0, description: 'A', quantity: 2, unit: 'kg', unit_price_gross: 1.5, vat_rate: 7, article_id: null },
      ],
    })
    expect(input.recipient).toEqual({ name: 'Müller', contactPerson: 'Max', street: 'Weg 1', postalCode: '1', city: 'Ort', countryCode: 'DE', vatId: 'DE1' })
    expect(input.items.map((i) => i.description)).toEqual(['A', 'B'])
    expect(input.items[0]).toEqual({ description: 'A', quantity: 2, unit: 'kg', unitPriceGross: 1.5, vatRate: 7 })
  })
})

describe('inputFromPayload (live preview, lenient)', () => {
  const payload = {
    number: '2026-0002',
    recipient: { name: 'Laufkunde', contactPerson: '', street: '', postalCode: '', city: '', countryCode: 'DE', vatId: '' },
    issueDate: '2026-10-07',
    serviceDateFrom: '',
    serviceDateTo: null,
    paymentDays: 'x',
    introText: 'Hallo',
    closingText: '',
    items: [
      { description: 'Gut', quantity: '1,5', unit: 'kg', unitPriceGross: '54,90', vatRate: '7' },
      { description: 'Kaputt', quantity: '1', unit: '', unitPriceGross: 'abc', vatRate: '7' },
      { description: 'Zu genau', quantity: '1,2345', unit: '', unitPriceGross: '1,00', vatRate: '7' },
      { description: 'Null', quantity: '0', unit: '', unitPriceGross: '1,00', vatRate: '19' },
      { description: 'Steuer', quantity: '1', unit: '', unitPriceGross: '1,00', vatRate: '16' },
    ],
  }
  test('keeps valid parts, drops unreadable lines, fills defaults', () => {
    const input = inputFromPayload(payload, '2026-10-08')
    expect(input).toMatchObject({ number: '2026-0002', issueDate: '2026-10-07', serviceDateFrom: '2026-10-08', paymentDays: null })
    expect(input.recipient).toMatchObject({ name: 'Laufkunde', contactPerson: null, vatId: null })
    expect(input.items).toEqual([{ description: 'Gut', quantity: 1.5, unit: 'kg', unitPriceGross: 54.9, vatRate: 7 }])
  })
  test('payment days: empty or unreadable = no due date, digits are used', () => {
    expect(inputFromPayload({ ...payload, paymentDays: '' }, '2026-10-08').paymentDays).toBeNull()
    expect(inputFromPayload({ ...payload, paymentDays: '30' }, '2026-10-08').paymentDays).toBe(30)
    expect(inputFromPayload({ ...payload, paymentDays: '999' }, '2026-10-08').paymentDays).toBe(365)
  })
  test('never throws on garbage', () => {
    expect(inputFromPayload(null, '2026-10-08')).toMatchObject({ number: '', items: [], issueDate: '2026-10-08' })
    expect(inputFromPayload({ items: 'x', recipient: 5 }, '2026-10-08').items).toEqual([])
    expect(inputFromPayload({ items: [null, 7, { quantity: 3 }] }, '2026-10-08').items).toEqual([])
  })
})
