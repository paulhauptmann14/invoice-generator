import JSZip from 'jszip'
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { LAYOUTS, themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'
import { forLetterhead } from './letterhead'

vi.mock('server-only', () => ({}))
const { renderInvoicePdf } = await import('./render-invoice-pdf')
const { renderInvoiceDocx } = await import('./render-invoice-docx')

const company = parseCompany({ name: 'Gasthaus Beispiel', street: 'Hauptstraße 1', postalCode: '12345', city: 'Musterstadt', taxNumber: '12/345/67890' })
const input: InvoiceInput = {
  number: '2026-0001',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: { name: 'Müller GmbH', contactPerson: null, street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  introText: '',
  closingText: '',
  items: [{ description: 'Menü', quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 }],
}
const SENDER_LINE = 'Gasthaus Beispiel · Hauptstraße 1 · 12345 Musterstadt'
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const logo = { type: 'png' as const, width: 1, height: 1, data: LOGO }

async function pdfFacts(buffer: Buffer) {
  const pdfjs = await getResolvedPDFJS()
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  const { fnArray } = await (await pdf.getPage(1)).getOperatorList()
  const images = fnArray.filter((fn: number) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length
  return { text, images }
}

async function docxFacts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const xml = (await Promise.all(Object.keys(zip.files).filter((n) => n.endsWith('.xml')).map((n) => zip.file(n)!.async('string')))).join('')
  return { xml, media: Object.keys(zip.files).filter((n) => n.startsWith('word/media/')).length }
}

describe('forLetterhead', () => {
  test('drops the logo and the sender line, leaves the stored theme untouched', () => {
    const theme = themeSchema.parse({ layout: 'briefpapier' })
    const doc = forLetterhead({ theme, logo })
    expect(doc.logo).toBeNull()
    expect(doc.theme.page.senderLine).toBe(false)
    expect(theme.page.senderLine).toBe(true)
  })
})

describe.each(LAYOUTS)('letterhead version of layout %s', (layout) => {
  const theme = themeSchema.parse({ layout })
  const vm = buildInvoiceViewModel(input, company, theme)
  const letterhead = forLetterhead({ theme, logo })

  test('PDF: no sender line and no image', async () => {
    const normal = await pdfFacts(await renderInvoicePdf(vm, theme, { logo }))
    expect(normal.text).toContain(SENDER_LINE)
    const printed = await pdfFacts(await renderInvoicePdf(vm, letterhead.theme, { logo: letterhead.logo }))
    expect(printed.text).not.toContain(SENDER_LINE)
    expect(printed.images).toBe(0)
    // The recipient stays where the letterhead's window expects it.
    expect(printed.text).toContain('Müller GmbH')
  })

  test('Word: no sender line and no image', async () => {
    const normal = await docxFacts(await renderInvoiceDocx(vm, theme, { logo }))
    expect(normal.xml).toContain(SENDER_LINE)
    const printed = await docxFacts(await renderInvoiceDocx(vm, letterhead.theme, { logo: letterhead.logo }))
    expect(printed.xml).not.toContain(SENDER_LINE)
    expect(printed.media).toBe(0)
    expect(printed.xml).toContain('Müller GmbH')
  })
})
