import JSZip from 'jszip'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { defaultTheme, themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))
const { renderInvoiceDocx } = await import('./render-invoice-docx')

const company = parseCompany({
  name: 'Gasthaus & Metzgerei Beispiel',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
})
const input = (n: number, paymentDays: number | null = 14): InvoiceInput => ({
  number: '2026-0001',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays,
  recipient: { name: 'Müller GmbH', contactPerson: null, street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  introText: 'Danke für Ihren Auftrag.',
  closingText: null,
  items: Array.from({ length: n }, (_, i) => ({ description: `Position ${i + 1}`, quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 })),
})

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Unzips the DOCX and returns the main XML parts plus their visible text. */
async function parts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const read = (name: string) => zip.file(name)!.async('string')
  const footerNames = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n))
  const doc = await read('word/document.xml')
  const footer = (await Promise.all(footerNames.map(read))).join('')
  const styles = await read('word/styles.xml')
  const text = (xml: string) => decode([...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' '))
  return { doc, footer, styles, docText: text(doc), footerText: text(footer) }
}

describe('renderInvoiceDocx', () => {
  test('renders a Word document with German content, totals and repeating table header', async () => {
    const buffer = await renderInvoiceDocx(buildInvoiceViewModel(input(2), company, defaultTheme), defaultTheme)
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    const { doc, docText, footer, footerText, styles } = await parts(buffer)
    for (const expected of ['Rechnung', '2026-0001', 'Müller GmbH', 'Gasthaus & Metzgerei Beispiel', 'Fällig am', 'Gesamtbetrag']) {
      expect(docText).toContain(expected)
    }
    expect(docText).toMatch(/20,00\s€/)
    expect(doc).toContain('<w:tblHeader')
    expect(doc).toContain('<w:cantSplit')
    expect(footerText).toContain('St.-Nr. 12/345/67890')
    // "Seite X von Y" are Word fields, updated when Word paginates.
    expect(footer).toMatch(/PAGE/)
    expect(footer).toMatch(/NUMPAGES/)
    expect(styles).toContain('IBM Plex Sans')
  })

  test('long invoices keep every line', async () => {
    const { docText } = await parts(await renderInvoiceDocx(buildInvoiceViewModel(input(60), company, defaultTheme), defaultTheme))
    expect(docText).toContain('Position 1')
    expect(docText).toContain('Position 60')
  })

  test('without payment terms: no due date line, payment note without a date', async () => {
    const { docText } = await parts(await renderInvoiceDocx(buildInvoiceViewModel(input(1, null), company, defaultTheme), defaultTheme))
    expect(docText).not.toContain('Fällig')
    expect(docText).toContain('unter Angabe der Rechnungsnummer 2026-0001.')
    expect(docText).not.toContain('bis zum')
  })

  test('theme options: hidden columns, no sender line, other font', async () => {
    const theme = themeSchema.parse({
      page: { din5008: 'A', senderLine: false },
      font: { builtin: 'Source Serif 4' },
      table: { showPosition: false, showUnit: false, showVatRate: false },
    })
    const { docText, styles } = await parts(await renderInvoiceDocx(buildInvoiceViewModel(input(1), company, theme), theme))
    expect(docText).toContain('Beschreibung')
    expect(docText).not.toContain('Pos.')
    expect(docText).not.toContain('Einheit')
    expect(docText.match(/Hauptstraße 1/g)).toBeNull() // no sender line; company address only in the footer
    expect(styles).toContain('Source Serif 4')
  })
})
