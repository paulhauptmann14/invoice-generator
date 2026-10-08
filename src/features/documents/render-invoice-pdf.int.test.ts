import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))

// These tests cover the "Klassisch" layout; the default layout is "Briefpapier".
const defaultTheme = themeSchema.parse({ layout: 'klassisch' })
const { renderInvoicePdf } = await import('./render-invoice-pdf')

const company = parseCompany({
  name: 'Gasthaus & Metzgerei Beispiel',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
})
const input = (n: number) => ({
  number: '2026-0001',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: { name: 'Müller GmbH', contactPerson: null, street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  introText: 'Danke für Ihren Auftrag.',
  closingText: null,
  items: Array.from({ length: n }, (_, i) => ({ description: `Position ${i + 1}`, quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 })),
})

async function pdfText(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: true })
  return { totalPages, text }
}

describe('renderInvoicePdf', () => {
  test('renders a valid PDF with German content and totals', async () => {
    const buffer = await renderInvoicePdf(buildInvoiceViewModel(input(2), company, defaultTheme), defaultTheme)
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    const { totalPages, text } = await pdfText(buffer)
    expect(totalPages).toBe(1)
    for (const expected of ['Rechnung', '2026-0001', 'Müller GmbH', 'Hauptstraße 1', 'Gesamtbetrag', 'Seite 1 von 1', 'St.-Nr. 12/345/67890']) {
      expect(text).toContain(expected)
    }
    // Intl puts a no-break space before the euro sign; text extraction may normalize it.
    expect(text).toMatch(/20,00\s€/)
  })

  test('long invoices break onto several pages with page numbers', async () => {
    const buffer = await renderInvoicePdf(buildInvoiceViewModel(input(60), company, defaultTheme), defaultTheme)
    const { totalPages, text } = await pdfText(buffer)
    expect(totalPages).toBeGreaterThan(1)
    expect(text).toContain(`Seite ${totalPages} von ${totalPages}`)
    expect(text).toContain('Position 60')
  })

  test('without payment terms: no due date anywhere, payment note without a date', async () => {
    const vm = buildInvoiceViewModel({ ...input(1), paymentDays: null }, company, defaultTheme)
    const { text } = await pdfText(await renderInvoicePdf(vm, defaultTheme))
    expect(text).not.toContain('Fällig')
    expect(text).not.toContain('bis zum')
    expect(text).toContain('Wir bitten höflich um Überweisung auf eines unserer nachfolgend genannten Konten:')
  })

  test('theme options: hidden columns, form A, other font', async () => {
    const theme = themeSchema.parse({
      layout: 'klassisch',
      page: { din5008: 'A', senderLine: false },
      font: { builtin: 'Source Serif 4' },
      table: { showPosition: false, showUnit: false, showVatRate: false },
    })
    const { text } = await pdfText(await renderInvoicePdf(buildInvoiceViewModel(input(1), company, theme), theme))
    expect(text).toContain('Beschreibung')
    expect(text).not.toContain('Pos.')
    expect(text).not.toContain('Einheit')
    // Sender line disabled: the address only appears in the footer, not above the recipient.
    expect(text.match(/Hauptstraße 1/g)).toHaveLength(1)
  })
})
