const PLAIN = /^-?\d+(\.\d+)?$/
const GERMAN = /^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/

/**
 * Parses user-typed decimals in German or plain notation: "24,90", "1.234,50", "24.90".
 * With a comma present, dots are thousands separators. Returns null for anything else.
 */
export function parseGermanDecimal(input: string): number | null {
  const s = input.trim().replace(/\s+/g, '')
  if (!s) return null
  let normalized: string
  if (s.includes(',')) {
    if (!GERMAN.test(s)) return null
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = s
  }
  if (!PLAIN.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Value for an editable input: comma decimal, two places, no thousands separators. */
export function formatDecimalInput(value: number): string {
  return value.toFixed(2).replace('.', ',')
}
