const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' }
const MAX_BASE_LENGTH = 120
const FALLBACK = 'Rechnung'

/** Makes a string safe for file names: transliterates umlauts, strips accents, collapses separators. */
export function sanitizeFilenamePart(input: string): string {
  return input
    .replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/([-_.])[-_.]+/g, '$1')
    .replace(/^[-_.]+|[-_.]+$/g, '')
}

function finalize(base: string, ext: 'pdf' | 'docx'): string {
  const clean = sanitizeFilenamePart(base).slice(0, MAX_BASE_LENGTH).replace(/[-_.]+$/, '')
  return `${clean || FALLBACK}.${ext}`
}

/** Template placeholders: {Kunde}, {Nr}, {Datum} (ISO date), {JJJJ}. */
export function buildFilename(
  template: string,
  ctx: { customer: string; number: string; issueDate: string },
  ext: 'pdf' | 'docx',
): string {
  const values: Record<string, string> = {
    Kunde: sanitizeFilenamePart(ctx.customer),
    Nr: sanitizeFilenamePart(ctx.number),
    Datum: ctx.issueDate,
    JJJJ: ctx.issueDate.slice(0, 4),
  }
  const base = template.replace(/\{(Kunde|Nr|Datum|JJJJ)\}/g, (_, key: string) => values[key])
  return finalize(base, ext)
}

/** Cleans a file name typed by the user in the export dialog and enforces the extension. */
export function normalizeUserFilename(input: string, ext: 'pdf' | 'docx'): string {
  const withoutExt = input.trim().replace(new RegExp(`\\.${ext}$`, 'i'), '')
  return finalize(withoutExt, ext)
}
