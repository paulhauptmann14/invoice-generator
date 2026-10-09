export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** ISO 13616 check: country code, two check digits, and mod-97 of the rearranged number equals 1. */
export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  return rest === 1
}
