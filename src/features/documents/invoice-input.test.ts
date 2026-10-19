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
      discount_kind: null,
      discount_value: null,
      invoice_items: [
        { id: 'b', position: 1, description: 'B', quantity: 1, unit: '', unit_price_gross: 2, vat_rate: 19, article_id: null, discount_kind: null, discount_value: null },
        { id: 'a', position: 0, description: 'A', quantity: 2, unit: 'kg', unit_price_gross: 1.5, vat_rate: 7, article_id: null, discount_kind: null, discount_value: null },
      ],
    })
    expect(input.recipient).toEqual({ name: 'Müller', contactPerson: 'Max', street: 'Weg 1', postalCode: '1', city: 'Ort', countryCode: 'DE', vatId: 'DE1' })
    expect(input.items.map((i) => i.description)).toEqual(['A', 'B'])
    expect(input.items[0]).toEqual({ description: 'A', quantity: 2, unit: 'kg', unitPriceGross: 1.5, vatRate: 7, discount: null })
    expect(input.discount).toBeNull()
  })
  test('maps the discount columns of items and invoice', () => {
    const row = { id: 'a', position: 0, description: 'A', quantity: 20, unit: '', unit_price_gross: 24.9, vat_rate: 7, article_id: null }
    const input = inputFromInvoice({
      number: '2026-0001',
      number_range_id: null,
      customer_id: null,
      recipient: {},
      issue_date: '2026-10-07',
      service_date_from: '2026-10-07',
      service_date_to: null,
      payment_days: null,
      intro_text: null,
      closing_text: null,
      discount_kind: 'amount',
      discount_value: 30.41,
      invoice_items: [
        { ...row, discount_kind: 'percent', discount_value: 10 },
        { ...row, id: 'b', position: 1, discount_kind: null, discount_value: null },
      ],
    })
    expect(input.discount).toEqual({ kind: 'amount', value: 30.41 })
    expect(input.items[0].discount).toEqual({ kind: 'percent', value: 10 })
    expect(input.items[1].discount).toBeNull()
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
    expect(input.items).toEqual([{ description: 'Gut', quantity: 1.5, unit: 'kg', unitPriceGross: 54.9, vatRate: 7, discount: null }])
    expect(input.discount).toBeNull()
  })
  test('preview: valid item and invoice discounts are used, unusable ones are dropped', () => {
    const input = inputFromPayload(
      {
        ...payload,
        discount: { kind: 'percent', value: '5' },
        items: [
          { description: 'A', quantity: '20', unit: '', unitPriceGross: '24,90', vatRate: '7', discount: { kind: 'percent', value: '10' } },
          { description: 'B', quantity: '1', unit: '', unitPriceGross: '10,00', vatRate: '7', discount: { kind: 'amount', value: '10,01' } },
          { description: 'C', quantity: '1', unit: '', unitPriceGross: '10,00', vatRate: '7', discount: { kind: 'percent', value: '' } },
          { description: 'D', quantity: '1', unit: '', unitPriceGross: '-10,00', vatRate: '7', discount: { kind: 'percent', value: '10' } },
        ],
      },
      '2026-10-08',
    )
    expect(input.items.map((i) => i.discount)).toEqual([{ kind: 'percent', value: 10 }, null, null, null])
    // D is negative, so the invoice discount is dropped as well
    expect(input.discount).toBeNull()
    const ok = inputFromPayload({ ...payload, discount: { kind: 'amount', value: '5,50' }, items: [payload.items[0]] }, '2026-10-08')
    expect(ok.discount).toEqual({ kind: 'amount', value: 5.5 })
    expect(inputFromPayload({ ...payload, discount: { kind: 'amount', value: '82,36' }, items: [payload.items[0]] }, '2026-10-08').discount).toBeNull()
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
