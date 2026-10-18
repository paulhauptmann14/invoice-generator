import JSZip from 'jszip'
import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))
const { renderInvoicePdf } = await import('./render-invoice-pdf')
const { renderInvoiceDocx } = await import('./render-invoice-docx')

// Layouts "Kompakt" and "Modern" (spec 3d).
const klassisch = themeSchema.parse({ layout: 'klassisch' })
const kompakt = themeSchema.parse({ layout: 'kompakt' })
const modern = themeSchema.parse({ layout: 'modern', colors: { accent: '#1F5F74' } })

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
  closingText: 'Mit freundlichen Grüßen',
  items: Array.from({ length: n }, (_, i) => ({ description: `Position ${i + 1}`, quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 })),
})
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const logo = { type: 'png' as const, width: 1, height: 1, data: LOGO }

async function pdfPages(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: false })
  return { totalPages, pages: text, text: text.join('\n') }
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
async function docxParts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files)
  const read = (name: string) => zip.file(name)!.async('string')
  const doc = await read('word/document.xml')
  const footer = (await Promise.all(names.filter((n) => /^word\/footer\d*\.xml$/.test(n)).map(read))).join('')
  const headers = (await Promise.all(names.filter((n) => /^word\/header\d*\.xml$/.test(n)).map(read))).join('')
  const text = (xml: string) => decode([...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' '))
  return { names, doc, footer, headers, docText: text(doc), footerText: text(footer) }
}

const twoBanks = parseCompany({
  name: 'Gasthaus',
  bankAccounts: [
    { bankName: 'Volksbank Beispiel', accountNumber: '4711', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
    { bankName: 'Sparkasse Beispiel', accountNumber: '', iban: 'DE02500105170137075030', bic: 'INGDDEFFXXX' },
  ],
})

describe.each([
  ['klassisch', klassisch],
  ['kompakt', kompakt],
  ['modern', modern],
] as const)('bank accounts in layout "%s"', (_name, theme) => {
  test('all accounts follow the payment note (PDF and Word)', async () => {
    const vm = buildInvoiceViewModel(input(1), twoBanks, theme)
    const { text } = await pdfPages(await renderInvoicePdf(vm, theme))
    const { docText } = await docxParts(await renderInvoiceDocx(vm, theme))
    for (const t of [text, docText]) {
      expect(t).toContain('Sparkasse Beispiel')
      expect(t).toContain('DE02 5001 0517 0137 0750 30')
      expect(t.indexOf('nachfolgend genannten Konten')).toBeLessThan(t.indexOf('Sparkasse Beispiel'))
    }
  })
})

const positionsOn = (page: string) => (page.match(/Position \d+\b/g) ?? []).length

describe.each([
  ['kompakt', kompakt],
  ['modern', modern],
] as const)('layout "%s"', (_name, theme) => {
  test('PDF: content in reading order, totals, footer and page numbers', async () => {
    const buffer = await renderInvoicePdf(buildInvoiceViewModel(input(2), company, theme), theme)
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    const { totalPages, text } = await pdfPages(buffer)
    expect(totalPages).toBe(1)
    const order = ['Müller GmbH', 'Rechnung', 'Danke für Ihren Auftrag.', 'Position 1', 'Gesamtbetrag', 'Mit freundlichen Grüßen']
    for (const expected of [...order, '2026-0001', 'Fällig am', 'St.-Nr. 12/345/67890', 'Seite 1 von 1']) expect(text).toContain(expected)
    const positions = order.map((s) => text.indexOf(s))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(text).toMatch(/20,00\s€/)
  })

  test('PDF: long invoices break onto several pages', async () => {
    const { totalPages, text } = await pdfPages(await renderInvoicePdf(buildInvoiceViewModel(input(90), company, theme), theme))
    expect(totalPages).toBeGreaterThan(1)
    expect(text).toContain(`Seite ${totalPages} von ${totalPages}`)
    expect(text).toContain('Position 90')
  })

  test('PDF: without payment terms there is no due date', async () => {
    const { text } = await pdfPages(await renderInvoicePdf(buildInvoiceViewModel(input(1, null), company, theme), theme))
    expect(text).not.toContain('Fällig')
  })

  test('Word: content, repeating table header, footer with page fields', async () => {
    const { doc, docText, footer, footerText } = await docxParts(await renderInvoiceDocx(buildInvoiceViewModel(input(2), company, theme), theme))
    for (const expected of ['Rechnung', '2026-0001', 'Müller GmbH', 'Gasthaus & Metzgerei Beispiel', 'Fällig am', 'Position 2', 'Gesamtbetrag', 'Mit freundlichen Grüßen']) {
      expect(docText).toContain(expected)
    }
    expect(docText.indexOf('Position 2')).toBeLessThan(docText.indexOf('Gesamtbetrag'))
    expect(doc).toContain('<w:tblHeader')
    expect(footerText).toContain('St.-Nr. 12/345/67890')
    expect(footer).toMatch(/NUMPAGES/)
  })
})

describe('layout "kompakt"', () => {
  test('without an invoice number the info line has no empty number label', async () => {
    const vm = buildInvoiceViewModel({ ...input(1), number: '' }, company, kompakt)
    const { text } = await pdfPages(await renderInvoicePdf(vm, kompakt))
    const { docText } = await docxParts(await renderInvoiceDocx(vm, kompakt))
    expect(text).not.toContain('Rechnungsnr.')
    expect(docText).not.toContain('Rechnungsnr.')
  })

  test('fits clearly more items on the first page than "Klassisch"', async () => {
    const first = async (theme: typeof klassisch) =>
      positionsOn((await pdfPages(await renderInvoicePdf(buildInvoiceViewModel(input(60), company, theme), theme))).pages[0])
    const [normal, compact] = await Promise.all([first(klassisch), first(kompakt)])
    expect(compact).toBeGreaterThanOrEqual(Math.round(normal * 1.5))
  })

  test('keeps hidden columns hidden', async () => {
    const theme = themeSchema.parse({ layout: 'kompakt', table: { showPosition: false, showUnit: false } })
    const { text } = await pdfPages(await renderInvoicePdf(buildInvoiceViewModel(input(1), company, theme), theme))
    expect(text).not.toContain('Pos.')
    expect(text).not.toContain('Einheit')
  })
})

describe('layout "modern"', () => {
  test('uses the accent color (Word) and has no zebra rows', async () => {
    const zebraTheme = themeSchema.parse({ layout: 'modern', colors: { accent: '#1F5F74', zebra: true } })
    const { doc } = await docxParts(await renderInvoiceDocx(buildInvoiceViewModel(input(3), company, zebraTheme), zebraTheme))
    expect(doc).toContain('1F5F74')
    expect(doc).not.toContain('F4F5F2')
  })

  test('Word: the logo does not push the body down (it is anchored in the exact-height spacer)', async () => {
    const vm = buildInvoiceViewModel(input(1), company, modern)
    const { doc } = await docxParts(await renderInvoiceDocx(vm, modern, { logo }))
    const body = doc.slice(doc.indexOf('<w:body>'))
    const drawingParagraph = body.slice(body.lastIndexOf('<w:p>', body.indexOf('<w:drawing>')), body.indexOf('</w:p>', body.indexOf('<w:drawing>')))
    expect(drawingParagraph).toMatch(/w:lineRule="exact(ly)?"/)
  })

  test('draws the logo when present (PDF and Word)', async () => {
    const vm = buildInvoiceViewModel(input(1), company, modern)
    expect((await renderInvoicePdf(vm, modern)).toString('latin1')).not.toContain('/Subtype /Image')
    expect((await renderInvoicePdf(vm, modern, { logo })).toString('latin1')).toContain('/Subtype /Image')
    const withLogo = await docxParts(await renderInvoiceDocx(vm, modern, { logo }))
    expect(withLogo.names.some((n) => n.startsWith('word/media/'))).toBe(true)
  })
})
