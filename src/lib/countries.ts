const CODES = ['DE', 'AT', 'BE', 'CH', 'CZ', 'DK', 'ES', 'FR', 'GB', 'IT', 'LU', 'NL', 'PL', 'SE'] as const
const names = new Intl.DisplayNames(['de'], { type: 'region' })

/** Country choices for addresses: Germany first, then alphabetically by German name. */
export const COUNTRIES = [
  { code: 'DE', name: names.of('DE')! },
  ...CODES.filter((c) => c !== 'DE')
    .map((code) => ({ code, name: names.of(code)! }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de')),
]
