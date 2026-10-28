import { divRound, toCents, toMilli, toRateBp } from './money'
import { calcTotals, type Discount, type LineInput } from './totals'

/**
 * Net amounts for an electronic invoice (EN 16931). The app works with gross prices, the standard with net amounts:
 * everything here is derived from `calcTotals`, so the totals of the e-invoice equal the printed ones to the cent.
 */

/** UNTDID 5305 VAT category: S = standard rate, Z = zero rated. */
export type VatCategory = 'S' | 'Z'

export type EInvoiceLine = {
  /** Quantity in thousandths; negative for a credit line (the net price must not be negative, BR-27). */
  quantityMilli: number
  /** Net unit price in 1/10000 euro (four decimals), never negative. */
  netPriceTenThousandths: number
  /** Net item discount (line allowance): quantity x net price - net line amount; 0 without a discount. */
  allowanceCents: number
  /** Net line amount after the item discount (BT-131). */
  netCents: number
  category: VatCategory
  rateBp: number
}

export type EInvoiceTaxGroup = { category: VatCategory; rateBp: number; basisCents: number; taxCents: number }

/** Net share of the invoice discount in one rate group (document level allowance, BG-20). */
export type EInvoiceAllowance = { category: VatCategory; rateBp: number; amountCents: number }

export type EInvoiceAmounts = {
  lines: EInvoiceLine[]
  allowances: EInvoiceAllowance[]
  taxGroups: EInvoiceTaxGroup[]
  /** BT-106: sum of the net line amounts. */
  lineTotalCents: number
  /** BT-107: sum of the document level allowances. */
  allowanceTotalCents: number
  /** BT-109 = BT-106 - BT-107. */
  taxBasisCents: number
  /** BT-110. */
  taxTotalCents: number
  /** BT-112, equals the printed gross total. */
  grandTotalCents: number
}

export function vatCategoryOf(rateBp: number): VatCategory {
  return rateBp === 0 ? 'Z' : 'S'
}

const toNet = (grossCents: number, rateBp: number) => divRound(grossCents * 10000, 10000 + rateBp)

/**
 * Splits `targetCents` across the exact net values `grossCents[i] / (1 + rate)` (largest remainder: floor each value,
 * hand out the leftover cents by largest fractional part, ties to the earlier line). The target is the rounded sum of
 * the exact values, so every line moves by less than one cent and the parts add up to the target exactly.
 */
function apportionNet(grossCents: number[], rateBp: number, targetCents: number): number[] {
  const denominator = 10000 + rateBp
  const parts = grossCents.map((gross, index) => {
    const numerator = gross * 10000
    const floor = Math.floor(numerator / denominator)
    return { index, value: floor, remainder: numerator - floor * denominator }
  })
  let leftover = targetCents - parts.reduce((acc, p) => acc + p.value, 0)
  const order = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const p of order) {
    if (leftover <= 0) break
    p.value += 1
    leftover -= 1
  }
  return parts.map((p) => p.value)
}

/**
 * Per rate group: the net line amounts add up to the net of the group's gross before the invoice discount; the
 * invoice discount becomes the difference to the printed net, so line amounts, allowances, tax bases and the
 * grand total stay consistent (BR-CO-10, BR-CO-13, BR-S-08) and equal the printed figures.
 */
export function calcEInvoiceAmounts(lines: LineInput[], invoiceDiscount?: Discount): EInvoiceAmounts {
  const totals = calcTotals(lines, invoiceDiscount)
  const rates = lines.map((line) => toRateBp(line.vatRate))
  const netByLine = new Array<number>(lines.length).fill(0)
  const allowances: EInvoiceAllowance[] = []

  for (const group of totals.taxGroups) {
    const indexes = rates.flatMap((rate, i) => (rate === group.rateBp ? [i] : []))
    const groupGross = indexes.map((i) => totals.lineTotalsCents[i])
    const lineNetSum = toNet(groupGross.reduce((acc, c) => acc + c, 0), group.rateBp)
    apportionNet(groupGross, group.rateBp, lineNetSum).forEach((net, k) => (netByLine[indexes[k]] = net))
    const allowance = lineNetSum - group.netCents
    if (allowance !== 0) allowances.push({ category: vatCategoryOf(group.rateBp), rateBp: group.rateBp, amountCents: allowance })
  }

  const eLines = lines.map((line, i): EInvoiceLine => {
    const rateBp = rates[i]
    const priceCents = toCents(line.unitPriceGross)
    const quantityMilli = toMilli(line.quantity)
    // A negative price becomes a negative quantity: same line amount, but a price that is not negative.
    const signedQuantity = priceCents < 0 ? -quantityMilli : quantityMilli
    const netPrice = divRound(Math.abs(priceCents) * 1000000, 10000 + rateBp)
    // The item discount is what makes quantity x net price add up to the line amount, so the line computes exactly.
    // Never negative: a one-cent discount can round away entirely.
    const allowance = totals.lineDiscountsCents[i] === 0 ? 0 : Math.max(0, divRound(signedQuantity * netPrice, 100000) - netByLine[i])
    return {
      quantityMilli: signedQuantity === 0 ? 0 : signedQuantity,
      netPriceTenThousandths: netPrice,
      allowanceCents: allowance,
      netCents: netByLine[i],
      category: vatCategoryOf(rateBp),
      rateBp,
    }
  })

  const lineTotalCents = eLines.reduce((acc, l) => acc + l.netCents, 0)
  const allowanceTotalCents = allowances.reduce((acc, a) => acc + a.amountCents, 0)
  return {
    lines: eLines,
    allowances,
    taxGroups: totals.taxGroups.map((g) => ({ category: vatCategoryOf(g.rateBp), rateBp: g.rateBp, basisCents: g.netCents, taxCents: g.vatCents })),
    lineTotalCents,
    allowanceTotalCents,
    taxBasisCents: lineTotalCents - allowanceTotalCents,
    taxTotalCents: totals.vatCents,
    grandTotalCents: totals.grossCents,
  }
}

/** UN/ECE Recommendation 20/21 codes for the units of the dropdown; anything else is "one" (C62). */
const UNIT_CODES: Record<string, string> = {
  'Stk.': 'H87',
  kg: 'KGM',
  g: 'GRM',
  l: 'LTR',
  'Fl.': 'XBO',
  Portion: 'PTN',
  'Pers.': 'IE',
  'Std.': 'HUR',
  Pauschale: 'LS',
}

export function unitCodeOf(unit: string): string {
  return UNIT_CODES[unit.trim()] ?? 'C62'
}

const regionNamesDe = new Intl.DisplayNames(['de'], { type: 'region' })
const regionNamesEn = new Intl.DisplayNames(['en'], { type: 'region' })
const normalize = (s: string) => s.trim().toLocaleLowerCase('de')

/** German and English country name (and the code itself) -> ISO 3166-1 alpha-2 code. */
const COUNTRY_CODES: Map<string, string> = (() => {
  const map = new Map<string, string>()
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b
      const de = regionNamesDe.of(code)
      // Unknown codes come back unchanged.
      if (!de || de === code) continue
      map.set(normalize(de), code)
      map.set(normalize(regionNamesEn.of(code) ?? code), code)
    }
  }
  return map
})()

/** The business's country (free text in the settings) as ISO code; empty means Germany. Null if not recognized. */
export function countryCodeOf(country: string): string | null {
  const value = country.trim()
  if (value === '') return 'DE'
  if (/^[A-Za-z]{2}$/.test(value)) {
    const code = value.toUpperCase()
    return regionNamesDe.of(code) !== code ? code : null
  }
  return COUNTRY_CODES.get(normalize(value)) ?? null
}
