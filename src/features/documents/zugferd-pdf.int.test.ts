import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream } from '@cantoo/pdf-lib'
import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))

const { renderInvoicePdf } = await import('./render-invoice-pdf')
const { embedZugferdXml, renderZugferdInvoicePdf } = await import('./zugferd-pdf')
const { buildZugferdXml } = await import('./zugferd-xml')

const company = parseCompany({
  name: 'Gasthaus & Metzgerei Beispiel',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
})
const input: InvoiceInput = {
  number: '2026-0001',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: { name: 'Müller GmbH', contactPerson: null, street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  // A line break makes react-pdf look for a "\n" glyph (see `claimLineBreaks` in fonts.ts).
  introText: 'Danke für Ihren Auftrag.\nMit freundlichen Grüßen',
  closingText: null,
  items: [{ description: 'Catering', quantity: 2, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 }],
}

function sourceFor(layout: string) {
  const theme = themeSchema.parse({ layout })
  return { vm: buildInvoiceViewModel(input, company, theme), theme, logo: null, input, company }
}

/** Every font of every page (also inside descendant fonts) with whether its program is embedded. */
function fonts(doc: PDFDocument): { name: string; embedded: boolean }[] {
  return doc.getPages().flatMap((page) => {
    const resources = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
    return (resources?.values() ?? []).map((ref) => {
      const font = doc.context.lookup(ref as PDFRef, PDFDict)
      const descendant = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
      const described = descendant ? doc.context.lookup(descendant.get(0), PDFDict) : font
      const descriptor = described.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
      const embedded = ['FontFile', 'FontFile2', 'FontFile3'].some((key) => descriptor?.has(PDFName.of(key)))
      return { name: String(font.get(PDFName.of('BaseFont'))), embedded }
    })
  })
}

describe('renderZugferdInvoicePdf', () => {
  test.each(['briefpapier', 'klassisch', 'kompakt', 'modern'])('%s: PDF/A-3 with the XML invoice attached', async (layout) => {
    const source = sourceFor(layout)
    const pdf = await renderZugferdInvoicePdf(source)
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.7')

    const doc = await PDFDocument.load(pdf, { updateMetadata: false })
    // The attachment is the XML invoice, declared as alternative representation (Factur-X).
    const af = doc.catalog.lookup(PDFName.of('AF'), PDFArray)
    const spec = doc.context.lookup(af.get(0), PDFDict)
    expect(String(spec.get(PDFName.of('AFRelationship')))).toBe('/Alternative')
    const file = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'), PDFStream)
    expect(String(file.dict.get(PDFName.of('Subtype')))).toBe('/text#2Fxml')
    expect(file).toBeInstanceOf(PDFRawStream)
    expect(new TextDecoder().decode(decodePDFRawStream(file as PDFRawStream).decode())).toBe(buildZugferdXml(input, company, source.vm))

    // XMP: PDF/A-3b, Factur-X properties, document info escaped ("&").
    const metadata = doc.catalog.lookup(PDFName.of('Metadata'), PDFStream)
    expect(metadata.dict.has(PDFName.of('Filter'))).toBe(false)
    const xmp = new TextDecoder().decode(metadata.getContents())
    expect(xmp).toContain('<pdfaid:part>3</pdfaid:part>')
    expect(xmp).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>')
    expect(xmp).toContain('<rdf:li>Gasthaus &amp; Metzgerei Beispiel</rdf:li>')

    // PDF/A: file identifier, output intent and only embedded fonts.
    expect(doc.context.trailerInfo.ID).toBeDefined()
    expect(doc.catalog.has(PDFName.of('OutputIntents'))).toBe(true)
    expect(fonts(doc).filter((f) => !f.embedded)).toEqual([])

    // Still the same printed invoice.
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true })
    expect(text).toContain('2026-0001')
    expect(text).toMatch(/49,80\s€/)
  })

  test('embedding refuses a PDF that was not rendered as PDF/A', async () => {
    const { vm, theme } = sourceFor('klassisch')
    await expect(embedZugferdXml(await renderInvoicePdf(vm, theme), '<x/>')).rejects.toThrow('Not a PDF/A document')
  })
})
