import 'server-only'
import { createHash } from 'node:crypto'
import type { DocumentProps } from '@react-pdf/renderer'
import { AFRelationship, PDFDocument, PDFHexString, PDFName, PDFRef } from '@cantoo/pdf-lib'
import type { Company } from '@/lib/domain/company'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceInput, InvoiceViewModel } from '@/lib/domain/view-model'
import type { DocumentLogo } from './logo'
import { renderInvoicePdf } from './render-invoice-pdf'
import { buildZugferdXml, escapeXml, ZUGFERD_CONFORMANCE_LEVEL, ZUGFERD_FILENAME } from './zugferd-xml'

/** The PDF conformance a ZUGFeRD invoice is rendered with (Factur-X requires PDF/A-3). */
export const ZUGFERD_PDF_CONFORMANCE: DocumentProps['conformance'] = 'PDF/A-3b'

const FX_NAMESPACE = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#'

const fxProperty = (name: string, description: string) => `
              <rdf:li rdf:parseType="Resource">
                <pdfaProperty:name>${name}</pdfaProperty:name>
                <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                <pdfaProperty:category>external</pdfaProperty:category>
                <pdfaProperty:description>${description}</pdfaProperty:description>
              </rdf:li>`

/** Factur-X properties plus the PDF/A extension schema that declares them (PDF/A only allows declared XMP properties). */
const FX_XMP = `
    <rdf:Description rdf:about="" xmlns:fx="${FX_NAMESPACE}">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${ZUGFERD_FILENAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${ZUGFERD_CONFORMANCE_LEVEL}</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>${FX_NAMESPACE}</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>${[
                fxProperty('DocumentFileName', 'Name of the embedded XML invoice file'),
                fxProperty('DocumentType', 'INVOICE'),
                fxProperty('Version', 'Version of the Factur-X XML schema'),
                fxProperty('ConformanceLevel', 'Factur-X profile of the XML invoice'),
              ].join('')}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
`

/** XMP date: ISO 8601 in UTC without milliseconds, as the document info dates are written. */
const xmpDate = (date: Date) => `${date.toISOString().split('.')[0]}Z`

/**
 * The complete XMP packet. pdfkit writes its own one without escaping ("Gasthaus & Metzgerei" breaks the XML), so the
 * packet is rebuilt here from the document info dictionary, which PDF/A requires it to match.
 */
function xmpPacket(doc: PDFDocument): string {
  const title = doc.getTitle()
  const author = doc.getAuthor()
  const creator = doc.getCreator()
  const producer = doc.getProducer()
  const created = doc.getCreationDate()
  const modified = doc.getModificationDate()
  const optional = (value: string | undefined, xml: (escaped: string) => string) => (value ? xml(escapeXml(value)) : '')
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">${optional(title, (t) => `
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${t}</rdf:li></rdf:Alt></dc:title>`)}${optional(author, (a) => `
      <dc:creator><rdf:Seq><rdf:li>${a}</rdf:li></rdf:Seq></dc:creator>`)}
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">${optional(creator, (c) => `
      <xmp:CreatorTool>${c}</xmp:CreatorTool>`)}${optional(created && xmpDate(created), (d) => `
      <xmp:CreateDate>${d}</xmp:CreateDate>`)}${optional(modified && xmpDate(modified), (d) => `
      <xmp:ModifyDate>${d}</xmp:ModifyDate>`)}
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">${optional(producer, (p) => `
      <pdf:Producer>${p}</pdf:Producer>`)}
    </rdf:Description>${FX_XMP}  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * Turns a PDF/A-3b invoice (rendered with `ZUGFERD_PDF_CONFORMANCE`) into a ZUGFeRD / Factur-X invoice: the XML is
 * attached as `factur-x.xml` (relationship "Alternative": it carries the same invoice) and the XMP metadata declares it.
 * The document info stays as rendered; the metadata is rebuilt from it, so both keep matching (PDF/A).
 */
export async function embedZugferdXml(pdf: Uint8Array, xml: string, now: Date = new Date()): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false })

  const metadataRef = doc.catalog.get(PDFName.of('Metadata'))
  if (!(metadataRef instanceof PDFRef) || !doc.catalog.has(PDFName.of('OutputIntents'))) {
    throw new Error('Not a PDF/A document: render with ZUGFERD_PDF_CONFORMANCE')
  }
  // PDF/A: the metadata stream stays unfiltered so it can be read without decoding.
  doc.context.assign(metadataRef, doc.context.stream(xmpPacket(doc), { Type: 'Metadata', Subtype: 'XML' }))

  await doc.attach(new TextEncoder().encode(xml), ZUGFERD_FILENAME, {
    mimeType: 'text/xml',
    description: 'Rechnungsdaten (ZUGFeRD / Factur-X, EN 16931)',
    creationDate: now,
    modificationDate: now,
    afRelationship: AFRelationship.Alternative,
  })
  // PDF/A requires a file identifier in the trailer, which pdfkit does not write.
  const id = PDFHexString.of(createHash('md5').update(pdf).update(xml).digest('hex'))
  doc.context.trailerInfo.ID = doc.context.obj([id, id])
  return Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }))
}

/** What a ZUGFeRD invoice is made of: the printed invoice and the data behind it (see `loadInvoiceDocument`). */
type ZugferdSource = { vm: InvoiceViewModel; theme: Theme; logo: DocumentLogo | null; input: InvoiceInput; company: Company }

/** The invoice as ZUGFeRD PDF (PDF/A-3b with the CII XML). Callers check `eInvoiceProblems` first. */
export async function renderZugferdInvoicePdf(doc: ZugferdSource): Promise<Buffer> {
  const pdf = await renderInvoicePdf(doc.vm, doc.theme, { logo: doc.logo }, { conformance: ZUGFERD_PDF_CONFORMANCE })
  return embedZugferdXml(pdf, buildZugferdXml(doc.input, doc.company, doc.vm))
}
