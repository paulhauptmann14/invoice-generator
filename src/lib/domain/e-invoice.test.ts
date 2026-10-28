import { describe, expect, test } from 'vitest'
import { calcEInvoiceAmounts, countryCodeOf, unitCodeOf } from './e-invoice'
import { calcTotals, type Discount, type LineInput } from './totals'

/** The consistency rules of EN 16931 that involve sums, plus "equals the printed invoice". */
function expectConsistent(lines: LineInput[], discount?: Discount) {
  const e = calcEInvoiceAmounts(lines, discount)
  const printed = calcTotals(lines, discount)
  const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0)

  // BR-CO-10, BR-CO-13, BR-CO-15
  expect(e.lineTotalCents).toBe(sum(e.lines.map((l) => l.netCents)))
  expect(e.allowanceTotalCents).toBe(sum(e.allowances.map((a) => a.amountCents)))
  expect(e.taxBasisCents).toBe(e.lineTotalCents - e.allowanceTotalCents)
  expect(e.grandTotalCents).toBe(e.taxBasisCents + e.taxTotalCents)
  // BR-S-08 / BR-Z-08: per rate, line nets minus allowances are the taxable amount
  for (const g of e.taxGroups) {
    const lineNets = sum(e.lines.filter((l) => l.rateBp === g.rateBp).map((l) => l.netCents))
    const allowances = sum(e.allowances.filter((a) => a.rateBp === g.rateBp).map((a) => a.amountCents))
    expect(g.basisCents).toBe(lineNets - allowances)
  }
  // Same figures as printed
  expect(e.grandTotalCents).toBe(printed.grossCents)
  expect(e.taxBasisCents).toBe(printed.netCents)
  expect(e.taxTotalCents).toBe(printed.vatCents)
  expect(e.lines.every((l) => l.netPriceTenThousandths >= 0)).toBe(true)
  return e
}

describe('calcEInvoiceAmounts', () => {
  test('19 % on an even amount: 11.90 gross -> 10.00 net', () => {
    const e = expectConsistent([{ quantity: 1, unitPriceGross: 11.9, vatRate: 19 }])
    expect(e.lines).toEqual([{ quantityMilli: 1000, netPriceTenThousandths: 100000, allowanceCents: 0, netCents: 1000, category: 'S', rateBp: 1900 }])
    expect(e.taxGroups).toEqual([{ category: 'S', rateBp: 1900, basisCents: 1000, taxCents: 190 }])
    expect(e.allowances).toEqual([])
  })

  test('line nets are apportioned so they add up to the printed net of the rate group', () => {
    // Three lines of 0.10 gross at 19 %: 0.0840 net each, 0.25 in total (not 3 x 0.08).
    const e = expectConsistent([1, 2, 3].map(() => ({ quantity: 1, unitPriceGross: 0.1, vatRate: 19 })))
    expect(e.lines.map((l) => l.netCents)).toEqual([9, 8, 8])
    expect(e.lineTotalCents).toBe(25)
  })

  test('mixed rates keep their own groups; 0 % is zero rated', () => {
    const e = expectConsistent([
      { quantity: 2, unitPriceGross: 24.9, vatRate: 7 },
      { quantity: 3, unitPriceGross: 3.5, vatRate: 19 },
      { quantity: 1, unitPriceGross: 5, vatRate: 0 },
    ])
    expect(e.taxGroups.map((g) => [g.category, g.rateBp])).toEqual([
      ['Z', 0],
      ['S', 700],
      ['S', 1900],
    ])
  })

  test('an item discount is a net line allowance', () => {
    const e = expectConsistent([{ quantity: 1, unitPriceGross: 119, vatRate: 19, discount: { kind: 'percent', value: 10 } }])
    expect(e.lines[0]).toMatchObject({ netPriceTenThousandths: 1000000, allowanceCents: 1000, netCents: 9000 })
  })

  test('a discounted line computes exactly: quantity x net price - allowance = line amount', () => {
    // 12 x 24.90 at 7 %, 10 % off: net price 23.2710, 279.25 before and 251.33 after the discount.
    const e = expectConsistent([{ quantity: 12, unitPriceGross: 24.9, vatRate: 7, discount: { kind: 'percent', value: 10 } }])
    expect(e.lines[0]).toMatchObject({ netPriceTenThousandths: 232710, allowanceCents: 2792, netCents: 25133 })
  })

  test('an invoice discount becomes one allowance per rate group', () => {
    const e = expectConsistent(
      [
        { quantity: 1, unitPriceGross: 107, vatRate: 7 },
        { quantity: 1, unitPriceGross: 119, vatRate: 19 },
      ],
      { kind: 'percent', value: 10 },
    )
    expect(e.allowances).toEqual([
      { category: 'S', rateBp: 700, amountCents: 1000 },
      { category: 'S', rateBp: 1900, amountCents: 1000 },
    ])
  })

  test('a negative price becomes a negative quantity with a positive net price (BR-27)', () => {
    const e = expectConsistent([
      { quantity: 1, unitPriceGross: 50, vatRate: 19 },
      { quantity: 1, unitPriceGross: -11.9, vatRate: 19 },
    ])
    expect(e.lines[1]).toMatchObject({ quantityMilli: -1000, netPriceTenThousandths: 100000, netCents: -1000 })
  })

  test('random invoices stay consistent', () => {
    // Deterministic pseudo-random numbers (LCG), so a failure can be reproduced.
    let seed = 42
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % max
    }
    const rates = [0, 7, 19, 5.5]
    for (let run = 0; run < 500; run++) {
      const lines: LineInput[] = Array.from({ length: 1 + next(8) }, () => {
        const unitPriceGross = (next(100000) - 5000) / 100
        // Item discounts only exist on positive lines (validation).
        const discount: Discount = unitPriceGross > 0 && next(3) === 0 ? { kind: 'percent', value: 1 + next(50) } : null
        return { quantity: (1 + next(5000)) / 1000, unitPriceGross, vatRate: rates[next(rates.length)], discount }
      })
      const subtotal = calcTotals(lines).subtotalCents
      const discount: Discount = subtotal > 0 && next(2) === 0 ? { kind: 'percent', value: next(30) } : null
      expectConsistent(lines, discount ?? undefined)
    }
  })
})

describe('unitCodeOf', () => {
  test.each([
    ['Stk.', 'H87'],
    ['Std.', 'HUR'],
    ['kg', 'KGM'],
    ['Pauschale', 'LS'],
    ['', 'C62'],
    ['Gutschein', 'C62'],
  ])('%s -> %s', (unit, code) => {
    expect(unitCodeOf(unit)).toBe(code)
  })
})

describe('countryCodeOf', () => {
  test.each([
    ['Deutschland', 'DE'],
    ['', 'DE'],
    ['  österreich ', 'AT'],
    ['Germany', 'DE'],
    ['ch', 'CH'],
    ['Atlantis', null],
    ['XX', null],
  ])('%s -> %s', (country, code) => {
    expect(countryCodeOf(country)).toBe(code)
  })
})
