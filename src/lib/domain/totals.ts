import { divRound, toCents, toMilli, toRateBp } from './money'

export type DiscountKind = 'percent' | 'amount'
export type Discount = { kind: DiscountKind; value: number | string } | null
/** Stored discount columns -> Discount; null for none (or an unknown kind / missing value). */
export function discountFromColumns(kind: string | null, value: number | string | null): Discount {
  if ((kind !== 'percent' && kind !== 'amount') || value === null) return null
  return { kind, value: Number(value) }
}

export type LineInput = {
  quantity: number | string
  unitPriceGross: number | string
  vatRate: number | string
  discount?: Discount
}
export type TaxGroup = { rateBp: number; grossCents: number; netCents: number; vatCents: number; discountCents: number }
export type Totals = {
  /** Per line, after the item discount (the "Gesamt" column). */
  lineTotalsCents: number[]
  /** Per line, 0 without a discount. */
  lineDiscountsCents: number[]
  /** Sum of lineTotalsCents. */
  subtotalCents: number
  /** 0 without an invoice discount. */
  invoiceDiscountCents: number
  /** After the invoice discount; discountCents is the group's share of it. */
  taxGroups: TaxGroup[]
  grossCents: number
  netCents: number
  vatCents: number
}

/**
 * Discount in cents on a base amount. Percent is rounded commercially, an amount is taken as is.
 * Does not clamp: validation guarantees the bounds.
 */
export function calcDiscountCents(baseCents: number, discount: Discount | undefined): number {
  if (!discount) return 0
  if (discount.kind === 'percent') return divRound(baseCents * toRateBp(discount.value), 10000)
  return toCents(discount.value)
}

/** Line amount before any discount. */
export function calcLineGrossCents(line: LineInput): number {
  return divRound(toMilli(line.quantity) * toCents(line.unitPriceGross), 1000)
}

/** Line amount after the item discount. */
export function calcLineTotalCents(line: LineInput): number {
  const gross = calcLineGrossCents(line)
  return gross - calcDiscountCents(gross, line.discount)
}

/**
 * Splits `discountCents` across the groups proportionally to their gross sums (largest remainder:
 * floor each share, hand out the leftover cents by largest fractional part, ties to the higher rate).
 * Integer math only: share_i = floor(D * g_i / S), remainder_i = (D * g_i) % S.
 */
function splitDiscount(groups: { rateBp: number; grossCents: number }[], discountCents: number): number[] {
  const total = groups.reduce((acc, g) => acc + g.grossCents, 0)
  if (total === 0 || discountCents === 0) return groups.map(() => 0)

  const parts = groups.map((g, index) => {
    const product = discountCents * g.grossCents
    const remainder = product % total
    return { index, rateBp: g.rateBp, share: (product - remainder) / total, remainder }
  })
  let leftover = discountCents - parts.reduce((acc, p) => acc + p.share, 0)
  const order = [...parts].sort((a, b) => b.remainder - a.remainder || b.rateBp - a.rateBp)
  for (const p of order) {
    if (leftover <= 0) break
    p.share += 1
    leftover -= 1
  }
  return parts.map((p) => p.share)
}

/**
 * Prices are gross. VAT is extracted per rate group from the group's gross sum
 * (not per line), so the gross total always equals what the user entered.
 * An invoice discount is split across the rate groups before VAT is extracted.
 */
export function calcTotals(lines: LineInput[], invoiceDiscount?: Discount): Totals {
  const lineGrossCents = lines.map((line) => calcLineGrossCents(line))
  const lineDiscountsCents = lines.map((line, i) => calcDiscountCents(lineGrossCents[i], line.discount))
  const lineTotalsCents = lineGrossCents.map((gross, i) => gross - lineDiscountsCents[i])
  const subtotalCents = lineTotalsCents.reduce((acc, c) => acc + c, 0)
  const invoiceDiscountCents = calcDiscountCents(subtotalCents, invoiceDiscount)

  const grossByRate = new Map<number, number>()
  lines.forEach((line, i) => {
    const rateBp = toRateBp(line.vatRate)
    grossByRate.set(rateBp, (grossByRate.get(rateBp) ?? 0) + lineTotalsCents[i])
  })

  const sortedGroups = [...grossByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBp, grossCents]) => ({ rateBp, grossCents }))
  const shares = splitDiscount(sortedGroups, invoiceDiscountCents)

  const taxGroups: TaxGroup[] = sortedGroups.map(({ rateBp, grossCents: groupGross }, i) => {
    const grossCents = groupGross - shares[i]
    const netCents = divRound(grossCents * 10000, 10000 + rateBp)
    return { rateBp, grossCents, netCents, vatCents: grossCents - netCents, discountCents: shares[i] }
  })

  const sum = (pick: (g: TaxGroup) => number) => taxGroups.reduce((acc, g) => acc + pick(g), 0)
  return {
    lineTotalsCents,
    lineDiscountsCents,
    subtotalCents,
    invoiceDiscountCents,
    taxGroups,
    grossCents: sum((g) => g.grossCents),
    netCents: sum((g) => g.netCents),
    vatCents: sum((g) => g.vatCents),
  }
}
