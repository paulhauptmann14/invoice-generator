// Number format tokens: {JJJJ} = 4-digit year, {JJ} = 2-digit year,
// {N…} = counter, zero-padded to the number of N's. Exactly one counter is required.

const TOKEN = /(\{JJJJ\}|\{JJ\}|\{N+\})/
const COUNTER = /^\{N+\}$/

/** Returns a German, user-facing error message, or null if the format is valid. */
export function validateNumberFormat(format: string): string | null {
  const counters = format.match(/\{N+\}/g) ?? []
  if (counters.length !== 1) return 'Das Format braucht genau einen Zähler-Platzhalter wie {NNNN}.'
  const unknown = format.replace(/\{JJJJ\}|\{JJ\}|\{N+\}/g, '').match(/\{[^}]*\}/)
  if (unknown) return `Unbekannter Platzhalter: ${unknown[0]}`
  return null
}

const yearToken = (token: string, year: number) =>
  token === '{JJJJ}' ? String(year) : String(year % 100).padStart(2, '0')

export function formatInvoiceNumber(format: string, year: number, seq: number): string {
  return format
    .split(TOKEN)
    .map((part) => {
      if (part === '{JJJJ}' || part === '{JJ}') return yearToken(part, year)
      if (COUNTER.test(part)) return String(seq).padStart(part.length - 2, '0')
      return part
    })
    .join('')
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Suggests the next number for the given year: highest existing number matching
 * the format + 1. Manually assigned numbers that don't match are ignored.
 * Returns '' when no valid format is configured (manual entry).
 */
export function suggestNextNumber(format: string | null, year: number, existing: string[]): string {
  if (!format || validateNumberFormat(format)) return ''
  const pattern = format
    .split(TOKEN)
    .map((part) => {
      if (part === '{JJJJ}' || part === '{JJ}') return yearToken(part, year)
      if (COUNTER.test(part)) return '(\\d+)'
      return escapeRegex(part)
    })
    .join('')
  const re = new RegExp(`^${pattern}$`)
  let max = 0
  for (const number of existing) {
    const match = re.exec(number.trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return formatInvoiceNumber(format, year, max + 1)
}
