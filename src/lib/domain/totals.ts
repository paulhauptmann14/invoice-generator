import { divRound, toCents, toMilli, toRateBp } from './money'

export type LineInput = { quantity: number | string; unitPriceGross: number | string; vatRate: number | string }
export type TaxGroup = { rateBp: number; grossCents: number; netCents: number; vatCents: number }
export type Totals = {
  lineTotalsCents: number[]
  taxGroups: TaxGroup[]
  grossCents: number
  netCents: number
  vatCents: number
}

export function calcLineTotalCents(line: LineInput): number {
  return divRound(toMilli(line.quantity) * toCents(line.unitPriceGross), 1000)
}

/**
 * Prices are gross. VAT is extracted per rate group from the group's gross sum
 * (not per line), so the gross total always equals what the user entered.
 */
export function calcTotals(lines: LineInput[]): Totals {
  const lineTotalsCents = lines.map(calcLineTotalCents)
  const grossByRate = new Map<number, number>()
  lines.forEach((line, i) => {
    const rateBp = toRateBp(line.vatRate)
    grossByRate.set(rateBp, (grossByRate.get(rateBp) ?? 0) + lineTotalsCents[i])
  })

  const taxGroups: TaxGroup[] = [...grossByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBp, grossCents]) => {
      const netCents = divRound(grossCents * 10000, 10000 + rateBp)
      return { rateBp, grossCents, netCents, vatCents: grossCents - netCents }
    })

  const sum = (pick: (g: TaxGroup) => number) => taxGroups.reduce((acc, g) => acc + pick(g), 0)
  return {
    lineTotalsCents,
    taxGroups,
    grossCents: sum((g) => g.grossCents),
    netCents: sum((g) => g.netCents),
    vatCents: sum((g) => g.vatCents),
  }
}
