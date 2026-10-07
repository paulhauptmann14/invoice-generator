import { describe, expect, test } from 'vitest'
import { calcLineTotalCents, calcTotals } from './totals'

describe('calcLineTotalCents', () => {
  test.each([
    [{ quantity: 2, unitPriceGross: 24.9, vatRate: 7 }, 4980],
    [{ quantity: '1.5', unitPriceGross: '12.99', vatRate: 7 }, 1949], // 19.485 -> 19.49
    [{ quantity: 0.333, unitPriceGross: 10, vatRate: 19 }, 333],
    [{ quantity: -1, unitPriceGross: 5, vatRate: 19 }, -500],
  ])('%o -> %i', (line, expected) => {
    expect(calcLineTotalCents(line)).toBe(expected)
  })
})

describe('calcTotals', () => {
  test('mixed VAT rates: VAT is extracted from the gross sum per rate group', () => {
    const t = calcTotals([
      { quantity: 2, unitPriceGross: 24.9, vatRate: 7 },
      { quantity: 3, unitPriceGross: 3.5, vatRate: 19 },
      { quantity: 1, unitPriceGross: 10, vatRate: '7.00' },
    ])
    expect(t.lineTotalsCents).toEqual([4980, 1050, 1000])
    // 7 %:  59,800,000 / 10,700 = 5588.79 -> 5589 net
    // 19 %: 10,500,000 / 11,900 =  882.35 ->  882 net
    expect(t.taxGroups).toEqual([
      { rateBp: 700, grossCents: 5980, netCents: 5589, vatCents: 391 },
      { rateBp: 1900, grossCents: 1050, netCents: 882, vatCents: 168 },
    ])
    expect(t.grossCents).toBe(7030)
    expect(t.netCents).toBe(6471)
    expect(t.vatCents).toBe(559)
  })

  test('19 % on an even amount: 11.90 gross -> 10.00 net + 1.90 VAT', () => {
    const t = calcTotals([{ quantity: 1, unitPriceGross: 11.9, vatRate: 19 }])
    expect(t.taxGroups).toEqual([{ rateBp: 1900, grossCents: 1190, netCents: 1000, vatCents: 190 }])
  })

  test('0 % yields no VAT', () => {
    const t = calcTotals([{ quantity: 1, unitPriceGross: 5, vatRate: 0 }])
    expect(t.taxGroups).toEqual([{ rateBp: 0, grossCents: 500, netCents: 500, vatCents: 0 }])
  })

  test('gross total equals the exact sum of line totals', () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({ quantity: 1, unitPriceGross: 0.33 + i, vatRate: i % 2 ? 19 : 7 }))
    const t = calcTotals(lines)
    expect(t.grossCents).toBe(t.lineTotalsCents.reduce((a, b) => a + b, 0))
    expect(t.netCents + t.vatCents).toBe(t.grossCents)
  })

  test('no lines', () => {
    expect(calcTotals([])).toEqual({ lineTotalsCents: [], taxGroups: [], grossCents: 0, netCents: 0, vatCents: 0 })
  })
})
