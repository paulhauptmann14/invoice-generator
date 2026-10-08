import {
  AlignmentType,
  convertMillimetersToTwip as twip,
  Document,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Paragraph,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from 'docx'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { din5008 } from '../din5008'
import type { DocumentLogo } from '../logo'
import { emu, frame, halfPoints, hex, lineHeight, lines, PAGE, spacer } from './docx-helpers'

const PX_PER_MM = 96 / 25.4

/**
 * Layout "Briefpapier" as an editable Word document – same structure and measurements as the PDF (spec 9a).
 * Head = logo only (floating, so it never pushes the text), no footer, no page numbers. View-model strings only.
 */
export function buildBriefpapierDocx(vm: InvoiceViewModel, theme: Theme, fontFamily: string, logo?: DocumentLogo | null): Document {
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const contentWidthMm = PAGE.widthMm - page.marginLeftMm - page.marginRightMm
  const dateTopMm = din.addressTopMm + din.addressHeightMm - 4
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 22
  // The template aligns the address with the body text (still inside the DIN window).
  const addressWidthMm = din.addressWidthMm - (page.marginLeftMm - din.addressLeftMm)
  const rightTab = (atMm: number) => ({ type: TabStopType.RIGHT, position: twip(atMm) })

  const logoWidthMm = theme.logo.widthMm
  const logoLeftMm =
    theme.logo.position === 'links'
      ? page.marginLeftMm
      : theme.logo.position === 'mitte'
        ? (PAGE.widthMm - logoWidthMm) / 2
        : PAGE.widthMm - page.marginRightMm - logoWidthMm
  const header = new Header({
    children: logo
      ? [
          new Paragraph({
            children: [
              new ImageRun({
                type: logo.type,
                data: logo.data,
                transformation: {
                  width: Math.round(logoWidthMm * PX_PER_MM),
                  height: Math.round(((logoWidthMm * logo.height) / logo.width) * PX_PER_MM),
                },
                floating: {
                  horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(logoLeftMm) },
                  verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(page.marginTopMm) },
                  wrap: { type: TextWrappingType.NONE },
                  allowOverlap: true,
                },
                altText: { name: 'Logo', title: 'Logo', description: vm.companyName },
              }),
            ],
          }),
        ]
      : [],
  })

  const amountRow = (label: string, amount: string, opts: { at: number; bold?: boolean; before?: number }) =>
    new Paragraph({
      keepLines: true,
      spacing: { before: opts.before ? twip(opts.before) : 0 },
      tabStops: [rightTab(opts.at)],
      children: [new TextRun({ text: `${label}\t${amount}`, bold: opts.bold, color: opts.bold ? hex(c.primary) : undefined })],
    })

  const bankParagraphs = vm.bankAccounts.flatMap((b) =>
    b.rows.map(
      ([label, value], rowIndex) =>
        new Paragraph({
          keepNext: rowIndex < b.rows.length - 1,
          // 4 mm before each bank (between the payment note and the first bank, and between banks).
          spacing: { before: rowIndex === 0 ? twip(4) : 0 },
          tabStops: [
            { type: TabStopType.LEFT, position: twip(50) },
            { type: TabStopType.LEFT, position: twip(70) },
          ],
          children: [new TextRun({ text: `${rowIndex === 0 ? b.bank : ''}\t${label}\t${value}` })],
        }),
    ),
  )

  return new Document({
    creator: vm.companyName,
    title: `${vm.title} ${vm.number}`.trim(),
    styles: {
      default: {
        document: {
          run: { font: fontFamily, size: halfPoints(base), color: hex(c.text), language: { value: 'de-DE' } },
          paragraph: { spacing: { ...lineHeight(base, 1.35), after: 0 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: twip(PAGE.widthMm), height: twip(PAGE.heightMm) },
            margin: {
              top: twip(page.marginTopMm),
              right: twip(page.marginRightMm),
              bottom: twip(page.marginBottomMm),
              left: twip(page.marginLeftMm),
              header: twip(5),
              footer: twip(5),
            },
          },
        },
        headers: { default: header },
        children: [
          // DIN 5008 elements in page-anchored frames.
          ...(page.senderLine && vm.senderLine !== ''
            ? [
                new Paragraph({
                  frame: frame(page.marginLeftMm, din.addressTopMm + din.endorsementZoneMm - 5.5, addressWidthMm, 4.5),
                  children: [new TextRun({ text: vm.senderLine, size: halfPoints(7), color: hex(c.primary), underline: {} })],
                }),
              ]
            : []),
          new Paragraph({
            frame: frame(page.marginLeftMm, din.addressTopMm + din.endorsementZoneMm, addressWidthMm, din.addressHeightMm - din.endorsementZoneMm),
            children: lines(vm.recipientLines),
          }),
          new Paragraph({
            frame: frame(PAGE.widthMm - page.marginRightMm - 50, dateTopMm, 50),
            alignment: AlignmentType.RIGHT,
            children: [new TextRun(vm.issueDate)],
          }),
          // Word drops spacing.before at the top of a page, so an exact-height paragraph reserves the head area.
          // 2.5 mm less than the PDF: Word sets the following line lower within its line box (measured in Word).
          new Paragraph(spacer(bodyTopMm - page.marginTopMm - 2.5)),
          new Paragraph({
            spacing: { after: twip(6) },
            children: [new TextRun({ text: vm.title, bold: true, allCaps: true, size: halfPoints(base + 1), color: hex(c.primary), characterSpacing: 8 })],
          }),
          new Paragraph({
            // Tax number about 12 mm after the invoice number, as in the template.
            tabStops: [{ type: TabStopType.LEFT, position: twip(22) }],
            children: [new TextRun(vm.taxIdLine !== '' ? `${vm.number}\t${vm.taxIdLine}` : vm.number)],
          }),
          ...(vm.recipientVatId ? [new Paragraph({ spacing: { before: twip(1) }, children: [new TextRun(`Ihre USt-IdNr.: ${vm.recipientVatId}`)] })] : []),
          new Paragraph({ spacing: { before: twip(1) }, children: [new TextRun(vm.serviceDateNote)] }),
          ...(vm.intro !== '' ? [new Paragraph({ spacing: { before: twip(6) }, children: lines(vm.intro.split('\n')) })] : []),
          ...vm.items.map((item, i) => amountRow(item.line, item.total, { at: contentWidthMm, before: i === 0 ? 14 : 0 })),
          amountRow('Gesamtbetrag brutto', vm.totals.gross, { at: contentWidthMm, bold: true, before: 8 }),
          ...vm.taxGroups.flatMap((g, i) => [
            amountRow(`davon ${g.rate} USt`, g.vat, { at: contentWidthMm * 0.75, before: i === 0 ? 8 : 0 }),
            amountRow('Rechnungsbetrag netto', g.net, { at: contentWidthMm * 0.75 }),
          ]),
          ...(vm.paymentNote !== '' ? [new Paragraph({ keepNext: true, spacing: { before: twip(16) }, children: lines(vm.paymentNote.split('\n')) })] : []),
          ...bankParagraphs,
          ...(vm.closing !== '' ? [new Paragraph({ spacing: { before: twip(6) }, children: lines(vm.closing.split('\n')) })] : []),
        ],
      },
    ],
  })
}
