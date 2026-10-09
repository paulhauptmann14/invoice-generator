import { describe, expect, test } from 'vitest'
import { calcTotals } from './totals'
import { sampleInvoice } from './sample-invoice'

describe('sampleInvoice', () => {
  test('uses the given date, number and payment days', () => {
    const invoice = sampleInvoice({ today: '2026-10-09', number: 'G1/26', paymentDays: 14 })
    expect(invoice).toMatchObject({ number: 'G1/26', issueDate: '2026-10-09', serviceDateFrom: '2026-10-09', serviceDateTo: null, paymentDays: 14 })
  })
  test('without payment days there is no due date', () => {
    expect(sampleInvoice({ today: '2026-10-09', number: 'X', paymentDays: null }).paymentDays).toBeNull()
  })
  test('has items with two VAT rates so the tax block is visible', () => {
    const items = sampleInvoice({ today: '2026-10-09', number: 'X', paymentDays: null }).items
    expect(new Set(items.map((i) => Number(i.vatRate)))).toEqual(new Set([7, 19]))
    expect(calcTotals(items).grossCents).toBeGreaterThan(0)
  })
})
