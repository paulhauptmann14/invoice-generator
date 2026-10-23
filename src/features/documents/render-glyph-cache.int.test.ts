import { extractText, getDocumentProxy } from 'unpdf'
import { expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { BUILTIN_FONTS, themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

// Own file on purpose: the bug lives in fonts cached across renders of one process, so every font has to start fresh here.
vi.mock('server-only', () => ({}))
const { renderInvoicePdf } = await import('./render-invoice-pdf')

const company = parseCompany({ name: 'Gasthaus Beispiel', street: 'Hauptstraße 1', postalCode: '12345', city: 'Musterstadt', taxNumber: '12/345/67890' })
// What the live preview renders right after "Neue Rechnung": nothing filled in yet.
const input = (introText: string): InvoiceInput => ({
  number: '',
  issueDate: '2026-10-23',
  serviceDateFrom: '2026-10-23',
  serviceDateTo: null,
  paymentDays: null,
  recipient: { name: '', contactPerson: null, street: '', postalCode: '', city: '', countryCode: 'DE', vatId: null },
  introText,
  closingText: '',
  items: [],
})

async function pdfText(buffer: Buffer) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true })
  return text
}

// Embedding a composite glyph ("Ü" of "Überweisung" in the payment note) fetched its component "U" from fontkit's
// glyph cache without code points; every later "U" of the process then had no Unicode mapping, so Firefox (pdf.js)
// dropped it and copied text lost it ("Ust" became "st").
test.each(BUILTIN_FONTS)('a letter keeps its Unicode mapping after an earlier PDF embedded it as a component (%s)', async (builtin) => {
  const theme = themeSchema.parse({ layout: 'briefpapier', font: { builtin } })
  const render = async (introText: string) => pdfText(await renderInvoicePdf(buildInvoiceViewModel(input(introText), company, theme), theme))

  expect(await render('')).toContain('Überweisung')
  for (const introText of ['U', 'Us', 'Ust', 'Übung Umbau']) {
    expect(await render(introText)).toContain(introText)
  }
})
