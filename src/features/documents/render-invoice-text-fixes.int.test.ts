import JSZip from 'jszip'
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { BUILTIN_FONTS, themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))
const { renderInvoicePdf } = await import('./render-invoice-pdf')
const { renderInvoiceDocx } = await import('./render-invoice-docx')

const company = parseCompany({ name: 'Gasthaus Beispiel', street: 'Hauptstraße 1', postalCode: '12345', city: 'Musterstadt', taxNumber: '12/345/67890' })
const input = (overrides: Partial<InvoiceInput> = {}, itemCount = 2): InvoiceInput => ({
  number: '2026-0001',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: { name: 'Müller GmbH', contactPerson: null, street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  introText: '',
  closingText: '',
  items: Array.from({ length: itemCount }, (_, i) => ({ description: `Position ${i + 1}`, quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 })),
  ...overrides,
})
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const logo = { type: 'png' as const, width: 1, height: 1, data: LOGO }

async function pdfText(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

/** Number of images painted on each page (from the page's operator list). */
async function imagesPerPage(buffer: Buffer): Promise<number[]> {
  const pdfjs = await getResolvedPDFJS()
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const counts: number[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { fnArray } = await (await pdf.getPage(n)).getOperatorList()
    counts.push(fnArray.filter((fn: number) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length)
  }
  return counts
}

async function docxParts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files)
  const read = (name: string) => zip.file(name)!.async('string')
  const doc = await read('word/document.xml')
  const headers = Object.fromEntries(await Promise.all(names.filter((n) => /^word\/header\d*\.xml$/.test(n)).map(async (n) => [n, await read(n)] as const)))
  const rels = await read('word/_rels/document.xml.rels')
  const allXml = (await Promise.all(names.filter((n) => n.endsWith('.xml')).map(read))).join('')
  return { doc, headers, rels, allXml }
}

describe('Briefpapier: the logo appears on page 1 only', () => {
  const theme = themeSchema.parse({ layout: 'briefpapier' })
  const longVm = buildInvoiceViewModel(input({}, 60), company, theme)

  test('PDF: one image on page 1, none on continuation pages', async () => {
    const buffer = await renderInvoicePdf(longVm, theme, { logo })
    const counts = await imagesPerPage(buffer)
    expect(counts.length).toBeGreaterThan(1)
    expect(counts[0]).toBe(1)
    expect(counts.slice(1).every((n) => n === 0)).toBe(true)
  })

  test('Word: the logo sits in a first-page-only header', async () => {
    const { doc, headers, rels } = await docxParts(await renderInvoiceDocx(longVm, theme, { logo }))
    expect(doc).toContain('<w:titlePg/>')
    expect(doc).toMatch(/<w:headerReference w:type="first"/)
    expect(doc).toMatch(/<w:headerReference w:type="default"/)
    const idOf = (type: 'first' | 'default') => new RegExp(`<w:headerReference w:type="${type}" r:id="(rId\\d+)"`).exec(doc)![1]
    const targetOf = (id: string) => `word/${new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)!.slice(1).find(Boolean)}`
    expect(headers[targetOf(idOf('first'))]).toContain('r:embed')
    expect(headers[targetOf(idOf('default'))]).not.toContain('r:embed')
  })
})

describe('PDF: text outside Latin-1 is rendered', () => {
  const names = {
    recipient: { name: 'Şahin Łukasz', contactPerson: 'Ağaoğlu', street: 'Dvořák-Gasse 1', postalCode: '54321', city: 'Zagreb', countryCode: 'DE', vatId: null },
    items: [{ description: 'Ćevapčići', quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 }],
  }
  const expected = ['Şahin Łukasz', 'Dvořák', 'Ćevapčići', 'Ağaoğlu']

  // Klassisch prints the company name bold (700); the other texts are regular (400).
  describe.each(BUILTIN_FONTS)('font "%s"', (builtin) => {
    test.each(['klassisch', 'briefpapier'] as const)('layout %s', async (layout) => {
      const theme = themeSchema.parse({ layout, font: { builtin } })
      const boldCompany = parseCompany({ ...company, name: 'Dvořák Ćevapčići Ağaoğlu Şahin Łukasz' })
      const text = await pdfText(await renderInvoicePdf(buildInvoiceViewModel(input(names), boldCompany, theme), theme))
      for (const part of expected) expect(text, `${builtin}/${layout}`).toContain(part)
      if (layout === 'klassisch') expect(text).toContain('Dvořák Ćevapčići Ağaoğlu Şahin Łukasz')
    })
  })

  test.each(['kompakt', 'modern'] as const)('layout %s', async (layout) => {
    const theme = themeSchema.parse({ layout })
    const text = await pdfText(await renderInvoicePdf(buildInvoiceViewModel(input(names), company, theme), theme))
    for (const part of expected) expect(text).toContain(part)
  })
})

describe.each(['klassisch', 'kompakt', 'modern', 'briefpapier'] as const)('Word layout "%s": user text', (layout) => {
  const theme = themeSchema.parse({ layout })
  const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/
  const dirty = input({
    introText: 'Hallo\u0007\nzweite Zeile',
    items: [{ description: 'Zeile eins\nZeile zwei\u0001', quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 }],
  })

  test('no control characters in any part, and a line break inside a two-line description', async () => {
    const { doc, allXml } = await docxParts(await renderInvoiceDocx(buildInvoiceViewModel(dirty, company, theme), theme, { logo }))
    expect(allXml).not.toMatch(CONTROL)
    // docx puts the break at the start of the next run (Briefpapier: the amount follows the first line after a tab).
    expect(doc).toMatch(/Zeile eins[^<]*<\/w:t><\/w:r><w:r>(?:<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:br\/><w:t[^>]*>Zeile zwei/)
    expect(doc).not.toMatch(/Zeile eins\n/)
  })
})
