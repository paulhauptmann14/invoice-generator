const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' }
const MAX_BASE_LENGTH = 120
const FALLBACK = 'Rechnung'

// Invalid in file names on Windows, macOS or Linux: / \ : * ? " < > | and control characters. Also unusable:
// bidi overrides/isolates (they can disguise the extension) and lone UTF-16 surrogates (encodeURIComponent throws
// on them); properly paired surrogates (emoji) stay.
const INVALID_CHARS =
  /(?:[/\\:*?"<>|\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff])+/g

/** German umlauts and ß become ae/oe/ue/ss, other accents are stripped. */
function transliterate(input: string): string {
  return input
    .replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Strict ASCII form for storage object keys (`[A-Za-z0-9._-]` only): transliterates umlauts, strips accents,
 * collapses separators. Never use it for names shown to the user.
 */
export function storageSafeName(input: string): string {
  return transliterate(input)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/([-_.])[-_.]+/g, '$1')
    .replace(/^[-_.]+|[-_.]+$/g, '')
}

/** ASCII-only fallback of a readable file name for old clients: keeps spaces, no quotes, backslashes or percent signs. */
export function toAsciiFilename(filename: string): string {
  return transliterate(filename).replace(/[^\x20-\x7e]|["\\%]/g, '_')
}

/** Readable file name part: invalid characters become spaces, whitespace is collapsed, NFC-normalized. */
function readable(input: string): string {
  return input.normalize('NFC').replace(INVALID_CHARS, ' ').replace(/\s+/g, ' ').trim()
}

function finalize(base: string, ext: 'pdf' | 'docx'): string {
  const clean = Array.from(readable(base).replace(/^[. ]+|[. ]+$/g, ''))
    .slice(0, MAX_BASE_LENGTH)
    .join('')
    .replace(/[. ]+$/, '')
  return `${clean || FALLBACK}.${ext}`
}

export type FilenameContext = {
  customer: string
  number: string
  issueDate: string
  /** Name of the invoice's number range; empty or missing for an invoice without one. */
  rangeName?: string | null
  /** The invoice's counter among those of the same customer in the same range. */
  customerSeq?: number | null
}

/** Template placeholders: {Kunde}, {Nr} (slashes become "-"), {Kreis}, {Zaehler}, {Datum} (ISO date), {JJJJ}. */
export function buildFilename(template: string, ctx: FilenameContext, ext: 'pdf' | 'docx'): string {
  const values: Record<string, string> = {
    Kunde: readable(ctx.customer),
    Nr: readable(ctx.number.replace(/[/\\]+/g, '-')),
    Kreis: readable(ctx.rangeName ?? ''),
    Zaehler: ctx.customerSeq == null ? '' : String(ctx.customerSeq),
    Datum: ctx.issueDate,
    JJJJ: ctx.issueDate.slice(0, 4),
  }
  // Split into literal template text (even indexes) and placeholders (odd indexes). Empty placeholders vanish and
  // only the template's own separators around them are tidied; substituted data is never touched.
  const parts = template.split(/(\{(?:Kunde|Nr|Kreis|Zaehler|Datum|JJJJ)\})/)
  const segments: { text: string; literal: boolean }[] = []
  parts.forEach((part, index) => {
    const literal = index % 2 === 0
    const text = literal ? part : values[part.slice(1, -1)]
    if (text === '') return
    const last = segments[segments.length - 1]
    if (literal && last?.literal) last.text += text
    else segments.push({ text, literal })
  })
  const tidy = segments.map((s) => (s.literal ? { ...s, text: s.text.replace(/([_-])\1+/g, '$1') } : s))
  if (tidy[0]?.literal) tidy[0].text = tidy[0].text.replace(/^[_\-\s]+/, '')
  const end = tidy[tidy.length - 1]
  if (end?.literal) end.text = end.text.replace(/[_\-\s]+$/, '')
  const base = tidy.map((s) => s.text).join('')
  return finalize(base, ext)
}

/** Cleans a file name typed by the user in the export dialog and enforces the extension. */
export function normalizeUserFilename(input: string, ext: 'pdf' | 'docx'): string {
  const withoutExt = input.trim().replace(new RegExp(`\\.${ext}$`, 'i'), '')
  return finalize(withoutExt, ext)
}
