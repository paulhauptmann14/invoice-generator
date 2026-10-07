// Dates are handled as ISO strings (YYYY-MM-DD) to avoid time-zone drift.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const match = ISO.exec(iso)
  if (!match) throw new Error(`Invalid date: "${iso}"`)
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new Error(`Invalid date: "${iso}"`)
  }
  return { y, m, d }
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

export function formatDateDe(iso: string): string {
  const { y, m, d } = parseIsoDate(iso)
  return `${pad(d)}.${pad(m)}.${pad(y, 4)}`
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseIsoDate(iso)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function yearOf(iso: string): number {
  return parseIsoDate(iso).y
}

export function todayIso(timeZone = 'Europe/Berlin', now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
