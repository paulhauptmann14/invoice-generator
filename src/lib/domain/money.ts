function toNumber(value: number | string): number {
  if (typeof value === 'string' && value.trim() === '') throw new Error(`Invalid number: "${value}"`)
  const n = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value
  if (!Number.isFinite(n)) throw new Error(`Invalid number: "${value}"`)
  return n
}

function scale(value: number | string, factor: number): number {
  const x = toNumber(value) * factor
  const rounded = Math.sign(x) * Math.round(Math.abs(x))
  return rounded === 0 ? 0 : rounded
}

/** Euro amount -> integer cents. */
export function toCents(value: number | string): number {
  return scale(value, 100)
}

/** Quantity -> thousandths (3 decimals, matches numeric(12,3)). */
export function toMilli(value: number | string): number {
  return scale(value, 1000)
}

/** VAT rate in percent -> basis points (7 -> 700). */
export function toRateBp(value: number | string): number {
  return scale(value, 100)
}

/** Integer division with commercial rounding (half away from zero). Never returns -0. */
export function divRound(numerator: number, denominator: number): number {
  if (!(denominator > 0)) throw new Error('divRound: denominator must be positive')
  const sign = numerator < 0 ? -1 : 1
  const abs = Math.abs(numerator)
  const q = Math.floor(abs / denominator)
  const r = abs - q * denominator
  const result = sign * (r * 2 >= denominator ? q + 1 : q)
  return result === 0 ? 0 : result
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const quantity = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 })
const rate = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

export function formatEuro(cents: number): string {
  return euro.format(cents / 100)
}

export function formatQuantity(value: number | string): string {
  return quantity.format(toMilli(value) / 1000)
}

export function formatVatRate(value: number | string): string {
  return `${rate.format(toRateBp(value) / 100)} %`
}
