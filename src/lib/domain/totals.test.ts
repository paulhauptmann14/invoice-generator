import { describe, expect, test } from 'vitest'
import { calcDiscountCents, calcLineGrossCents, calcLineTotalCents, calcTotals, discountFromColumns } from './totals'

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
      { rateBp: 700, grossCents: 5980, netCents: 5589, vatCents: 391, discountCents: 0 },
      { rateBp: 1900, grossCents: 1050, netCents: 882, vatCents: 168, discountCents: 0 },
    ])
    expect(t.grossCents).toBe(7030)
    expect(t.netCents).toBe(6471)
    expect(t.vatCents).toBe(559)
  })

  test('19 % on an even amount: 11.90 gross -> 10.00 net + 1.90 VAT', () => {
    const t = calcTotals([{ quantity: 1, unitPriceGross: 11.9, vatRate: 19 }])
    expect(t.taxGroups).toEqual([{ rateBp: 1900, grossCents: 1190, netCents: 1000, vatCents: 190, discountCents: 0 }])
  })

  test('0 % yields no VAT', () => {
    const t = calcTotals([{ quantity: 1, unitPriceGross: 5, vatRate: 0 }])
    expect(t.taxGroups).toEqual([{ rateBp: 0, grossCents: 500, netCents: 500, vatCents: 0, discountCents: 0 }])
  })

  test('gross total equals the exact sum of line totals', () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({ quantity: 1, unitPriceGross: 0.33 + i, vatRate: i % 2 ? 19 : 7 }))
    const t = calcTotals(lines)
    expect(t.grossCents).toBe(t.lineTotalsCents.reduce((a, b) => a + b, 0))
    expect(t.netCents + t.vatCents).toBe(t.grossCents)
  })

  test('no lines', () => {
    expect(calcTotals([])).toEqual({
      lineTotalsCents: [],
      lineDiscountsCents: [],
      subtotalCents: 0,
      invoiceDiscountCents: 0,
      taxGroups: [],
      grossCents: 0,
      netCents: 0,
      vatCents: 0,
    })
  })
})

describe('calcDiscountCents', () => {
  test('percent rounds commercially, amount is taken as is, none is 0', () => {
    expect(calcDiscountCents(49800, { kind: 'percent', value: 10 })).toBe(4980)
    expect(calcDiscountCents(1001, { kind: 'percent', value: '12,5' })).toBe(125) // 125.125 -> 125
    expect(calcDiscountCents(1000, { kind: 'amount', value: '3,50' })).toBe(350)
    expect(calcDiscountCents(1000, null)).toBe(0)
  })
})

describe('discounts', () => {
  const specLines = [
    { quantity: 20, unitPriceGross: 24.9, vatRate: 7, discount: { kind: 'percent' as const, value: 10 } },
    { quantity: 20, unitPriceGross: 8, vatRate: 19 },
  ]
  const specGroups = [
    { rateBp: 700, discountCents: 2241, grossCents: 42579, netCents: 39793, vatCents: 2786 },
    { rateBp: 1900, discountCents: 800, grossCents: 15200, netCents: 12773, vatCents: 2427 },
  ]

  test('calcLineGrossCents is the amount before the discount', () => {
    expect(calcLineGrossCents(specLines[0])).toBe(49800)
    expect(calcLineTotalCents(specLines[0])).toBe(44820)
  })

  test('item percent discount', () => {
    const t = calcTotals([specLines[0]])
    expect(t.lineDiscountsCents[0]).toBe(4980)
    expect(t.lineTotalsCents[0]).toBe(44820)
  })

  test('item amount discount applies to the whole line', () => {
    const t = calcTotals([{ quantity: 20, unitPriceGross: 24.9, vatRate: 7, discount: { kind: 'amount', value: '50' } }])
    expect(t.lineDiscountsCents[0]).toBe(5000)
    expect(t.lineTotalsCents[0]).toBe(44800)
  })

  test('spec example', () => {
    const t = calcTotals(specLines, { kind: 'percent', value: 5 })
    expect(t.lineTotalsCents).toEqual([44820, 16000])
    expect(t.lineDiscountsCents).toEqual([4980, 0])
    expect(t.subtotalCents).toBe(60820)
    expect(t.invoiceDiscountCents).toBe(3041)
    expect(t.taxGroups).toEqual(specGroups)
    expect(t.grossCents).toBe(57779)
    expect(t.netCents + t.vatCents).toBe(57779)
  })

  test('invoice amount discount', () => {
    const t = calcTotals(specLines, { kind: 'amount', value: '30.41' })
    expect(t.invoiceDiscountCents).toBe(3041)
    expect(t.taxGroups).toEqual(specGroups)
    expect(t.grossCents).toBe(57779)
  })

  test('splits remainder cents to the higher rate on a tie', () => {
    const t = calcTotals(
      [
        { quantity: 1, unitPriceGross: 10, vatRate: 7 },
        { quantity: 1, unitPriceGross: 10, vatRate: 19 },
      ],
      { kind: 'amount', value: '0.01' },
    )
    expect(t.taxGroups.map((g) => [g.rateBp, g.discountCents])).toEqual([
      [700, 0],
      [1900, 1],
    ])
  })

  test('shares always add up to the discount', () => {
    const t = calcTotals(
      [
        { quantity: 1, unitPriceGross: 33.33, vatRate: 7 },
        { quantity: 1, unitPriceGross: 33.33, vatRate: 19 },
        { quantity: 1, unitPriceGross: 33.34, vatRate: 0 },
      ],
      { kind: 'percent', value: 10 },
    )
    expect(t.invoiceDiscountCents).toBe(1000)
    expect(t.taxGroups.reduce((a, g) => a + g.discountCents, 0)).toBe(t.invoiceDiscountCents)
    expect(t.grossCents).toBe(t.subtotalCents - t.invoiceDiscountCents)
  })

  test('100 % discount gives zero', () => {
    const t = calcTotals([{ quantity: 2, unitPriceGross: 24.9, vatRate: 7, discount: { kind: 'percent', value: 100 } }])
    expect(t.grossCents).toBe(0)
    expect(t.taxGroups).toEqual([{ rateBp: 700, grossCents: 0, netCents: 0, vatCents: 0, discountCents: 0 }])
  })

  test('100 % invoice discount gives zero and keeps the groups', () => {
    const t = calcTotals(specLines, { kind: 'percent', value: 100 })
    expect(t.grossCents).toBe(0)
    expect(t.taxGroups.map((g) => g.grossCents)).toEqual([0, 0])
    expect(t.taxGroups.reduce((a, g) => a + g.discountCents, 0)).toBe(60820)
  })

  test('without discounts nothing changes', () => {
    const t = calcTotals([
      { quantity: 2, unitPriceGross: 24.9, vatRate: 7 },
      { quantity: 3, unitPriceGross: 3.5, vatRate: 19 },
      { quantity: 1, unitPriceGross: 10, vatRate: '7.00' },
    ])
    expect(t.lineTotalsCents).toEqual([4980, 1050, 1000])
    expect(t.lineDiscountsCents).toEqual([0, 0, 0])
    expect(t.subtotalCents).toBe(t.grossCents)
    expect(t.invoiceDiscountCents).toBe(0)
    expect(t.taxGroups.every((g) => g.discountCents === 0)).toBe(true)
    expect(t.grossCents).toBe(7030)
    expect(t.netCents).toBe(6471)
    expect(t.vatCents).toBe(559)
  })
})

describe('discountFromColumns', () => {
  test('maps stored columns; none or unknown kinds give null', () => {
    expect(discountFromColumns('percent', 12.5)).toEqual({ kind: 'percent', value: 12.5 })
    expect(discountFromColumns('amount', 30.41)).toEqual({ kind: 'amount', value: 30.41 })
    expect(discountFromColumns(null, null)).toBeNull()
    expect(discountFromColumns('percent', null)).toBeNull()
    expect(discountFromColumns('x', 10)).toBeNull()
  })
})
