import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip as twip,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx'
import { DOCUMENT_COLORS, readableTextOn, type Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { din5008 } from '../din5008'
import type { DocumentLogo } from '../logo'
import { type Column, emu, frame, halfPoints, hex, itemColumns, lineHeight, lines, NO_BORDERS, NONE, PAGE, spacer } from './docx-helpers'
import { bankDetails } from './density'
import { modernHead } from './modern-metrics'

const PX_PER_MM = 96 / 25.4
const MUTED = hex(DOCUMENT_COLORS.muted)

/** Layout "Modern" as an editable Word document – same structure and measurements as the PDF (spec 3d). */
export function buildModernDocx(vm: InvoiceViewModel, theme: Theme, fontFamily: string, logo?: DocumentLogo | null): Document {
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const contentWidthMm = PAGE.widthMm - page.marginLeftMm - page.marginRightMm
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 8.46
  const head = modernHead(theme, logo ?? null, vm.companyName)
  const columns = itemColumns(theme)
  const widthOf = (col: Column) => twip((contentWidthMm * col.pct) / 100)

  const cell = (col: Column, text: string, header: boolean, detail?: string | null) =>
    new TableCell({
      width: { size: widthOf(col), type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 0, right: 80 },
      borders: {
        top: NONE,
        left: NONE,
        right: NONE,
        bottom: header
          ? { style: BorderStyle.SINGLE, size: 8, color: hex(c.primary) }
          : {
              style: BorderStyle.SINGLE,
              size: 4,
              color: hex(DOCUMENT_COLORS.rule),
            },
      },
      children: [
        new Paragraph({
          alignment: col.align,
          // Item descriptions may span several lines: one run per line with a break (a raw \n in <w:t> shows as a space in Word).
          children: lines(text.split('\n'), { bold: header, color: header ? hex(c.primary) : undefined }),
        }),
        ...(detail
          ? [
              new Paragraph({
                alignment: col.align,
                spacing: { ...lineHeight(base - 1.5, 1.35), after: 0 },
                children: [new TextRun({ text: detail, size: halfPoints(base - 1.5), color: MUTED })],
              }),
            ]
          : []),
      ],
    })
  // No zebra rows in "Modern" (spec 3d), whatever the theme says.
  const itemsTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: twip(contentWidthMm), type: WidthType.DXA },
    columnWidths: columns.map(widthOf),
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: columns.map((col) => cell(col, col.label, true)),
      }),
      ...vm.items.map(
        (item) =>
          new TableRow({
            cantSplit: true,
            children: columns.map((col) => cell(col, col.value(item), false, col.detail?.(item))),
          }),
      ),
    ],
  })

  const band = readableTextOn(c.accent)
  const totalsRow = (label: string, value: string, strong = false) =>
    new TableRow({
      cantSplit: true,
      children: [label, value].map(
        (text, idx) =>
          new TableCell({
            borders: NO_BORDERS,
            shading: strong ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(c.accent) } : undefined,
            margins: {
              top: strong ? 100 : 20,
              bottom: strong ? 100 : 20,
              left: 120,
              right: 120,
            },
            children: [
              new Paragraph({
                alignment: idx === 1 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text,
                    bold: strong,
                    size: strong ? halfPoints(base + 1.5) : undefined,
                    color: strong ? hex(band) : undefined,
                  }),
                ],
              }),
            ],
          }),
      ),
    })
  const totalsTable = new Table({
    alignment: AlignmentType.RIGHT,
    width: { size: twip(contentWidthMm / 2), type: WidthType.DXA },
    borders: NO_BORDERS,
    rows: [
      ...(vm.totals.subtotal !== null && vm.totals.discount !== null
        ? [totalsRow('Zwischensumme', vm.totals.subtotal), totalsRow(vm.totals.discount.label, vm.totals.discount.amount)]
        : []),
      ...vm.taxGroups.flatMap((g) => [totalsRow(`Nettobetrag ${g.rate}`, g.net), totalsRow(`MwSt. ${g.rate}`, g.vat)]),
      totalsRow('Gesamtbetrag', vm.totals.gross, true),
    ],
  })

  const info: [string, string][] = [
    ['Rechnungsnr.', vm.number],
    ['Rechnungsdatum', vm.issueDate],
    ['Leistungsdatum', vm.serviceDate],
    ...(vm.dueDate ? ([['Fällig am', vm.dueDate]] as [string, string][]) : []),
    ...(vm.recipientVatId ? ([['Ihre USt-IdNr.', vm.recipientVatId]] as [string, string][]) : []),
  ]
  // Label/value pairs in two columns, like the PDF (72 mm wide, right-aligned block).
  const infoWidthMm = 72
  const infoXMm = PAGE.widthMm - page.marginRightMm - infoWidthMm
  const pairHeightMm = 10
  const infoFrames = info.map(
    ([label, value], i) =>
      new Paragraph({
        frame: frame(infoXMm + (i % 2) * (infoWidthMm / 2), din.infoTopMm + Math.floor(i / 2) * pairHeightMm, infoWidthMm / 2),
        spacing: lineHeight(base, 1.3),
        children: [new TextRun({ text: label, size: halfPoints(7), color: MUTED }), new TextRun({ text: value, break: 1 })],
      }),
  )

  const footerTable = new Table({
    layout: TableLayoutType.AUTOFIT,
    width: { size: twip(contentWidthMm), type: WidthType.DXA },
    borders: {
      ...NO_BORDERS,
      top: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: hex(DOCUMENT_COLORS.rule),
      },
    },
    rows: [
      new TableRow({
        children: (vm.footerColumns.length > 0 ? vm.footerColumns : ['']).map(
          (col) =>
            new TableCell({
              margins: { top: 80, left: 0, right: 120 },
              children: [
                new Paragraph({
                  spacing: lineHeight(6.5, 1.4),
                  children: lines(col.split('\n'), {
                    size: halfPoints(6.5),
                    color: MUTED,
                  }),
                }),
              ],
            }),
        ),
      }),
    ],
  })
  const pageNumber = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 60 },
    children: [
      new TextRun({
        children: ['Seite ', PageNumber.CURRENT, ' von ', PageNumber.TOTAL_PAGES],
        size: halfPoints(6.5),
        color: MUTED,
      }),
    ],
  })
  const mark = (yMm: number, widthMm = 4) =>
    new Paragraph({
      frame: frame(5, yMm, widthMm, 0.5),
      border: {
        top: {
          style: BorderStyle.SINGLE,
          size: 4,
          color: hex(DOCUMENT_COLORS.mark),
        },
      },
      children: [],
    })

  // Logo on the first page only, floating and anchored to the page. It sits in the exact-height spacer paragraph
  // (an ordinary paragraph would push the body down by one line).
  const logoRun =
    logo && head.logoWidthMm > 0
      ? [
          new ImageRun({
            type: logo.type,
            data: logo.data,
            transformation: {
              width: Math.round(head.logoWidthMm * PX_PER_MM),
              height: Math.round(head.logoHeightMm * PX_PER_MM),
            },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: emu(PAGE.widthMm - page.marginRightMm - head.logoWidthMm),
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: emu(page.marginTopMm),
              },
              wrap: { type: TextWrappingType.NONE },
              allowOverlap: true,
            },
            altText: {
              name: 'Logo',
              title: 'Logo',
              description: vm.companyName,
            },
          }),
        ]
      : []

  return new Document({
    creator: vm.companyName,
    title: `${vm.title} ${vm.number}`.trim(),
    styles: {
      default: {
        document: {
          run: {
            font: fontFamily,
            size: halfPoints(base),
            color: hex(c.text),
            language: { value: 'de-DE' },
          },
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
              bottom: twip(page.marginBottomMm + 18),
              left: twip(page.marginLeftMm),
              header: twip(5),
              footer: twip(page.marginBottomMm - 6),
            },
          },
        },
        headers: {
          default: new Header({
            children: [mark(din.foldMarksMm[0]), mark(din.punchMarkMm, 6), mark(din.foldMarksMm[1])],
          }),
        },
        footers: {
          default: new Footer({ children: [footerTable, pageNumber] }),
        },
        children: [
          new Paragraph({
            frame: frame(page.marginLeftMm, page.marginTopMm, head.nameWidthMm),
            spacing: lineHeight(head.nameSizePt, 1.1),
            children: [
              new TextRun({
                text: vm.companyName,
                bold: true,
                size: halfPoints(head.nameSizePt),
                color: hex(c.primary),
              }),
            ],
          }),
          new Paragraph({
            frame: frame(page.marginLeftMm, head.ruleTopMm, contentWidthMm, 0.6),
            border: {
              top: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: hex(c.accent),
              },
            },
            children: [],
          }),
          ...(page.senderLine && vm.senderLine !== ''
            ? [
                new Paragraph({
                  frame: frame(din.addressLeftMm, din.addressTopMm + din.endorsementZoneMm - 4.5, din.addressWidthMm, 4.5),
                  children: [
                    new TextRun({
                      text: vm.senderLine,
                      size: halfPoints(7),
                      color: hex(c.primary),
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({
            frame: frame(din.addressLeftMm, din.addressTopMm + din.endorsementZoneMm, din.addressWidthMm, din.addressHeightMm - din.endorsementZoneMm),
            children: lines(vm.recipientLines),
          }),
          ...infoFrames,
          // Body starts two lines below the address field (exact-height spacer, see docx-helpers).
          new Paragraph({
            ...spacer(bodyTopMm - page.marginTopMm),
            children: logoRun,
          }),
          new Paragraph({
            spacing: {
              ...lineHeight(theme.font.headingSizePt, 1.15),
              after: twip(5),
            },
            children: [
              new TextRun({
                text: vm.title,
                bold: true,
                size: halfPoints(theme.font.headingSizePt),
                color: hex(c.primary),
              }),
              ...(vm.number !== ''
                ? [
                    new TextRun({
                      text: ` ${vm.number}`,
                      size: halfPoints(theme.font.headingSizePt),
                      color: hex(c.primary),
                    }),
                  ]
                : []),
            ],
          }),
          ...(vm.intro !== ''
            ? [
                new Paragraph({
                  spacing: { after: twip(5) },
                  children: lines(vm.intro.split('\n')),
                }),
              ]
            : []),
          itemsTable,
          new Paragraph(spacer(4)),
          totalsTable,
          ...(vm.paymentNote !== ''
            ? [
                new Paragraph({
                  keepNext: true,
                  spacing: {
                    before: twip(8),
                    after: twip(vm.bankAccounts.length > 0 ? 1.5 : 5),
                  },
                  children: lines(vm.paymentNote.split('\n')),
                }),
              ]
            : []),
          ...vm.bankAccounts.map(
            (b, i) =>
              new Paragraph({
                keepNext: true,
                spacing: {
                  after: i === vm.bankAccounts.length - 1 ? twip(5) : 0,
                },
                children: [...(b.bank !== '' ? [new TextRun({ text: `${b.bank}\u2003`, bold: true })] : []), new TextRun({ text: bankDetails(b.rows) })],
              }),
          ),
          ...(vm.closing !== '' ? [new Paragraph({ children: lines(vm.closing.split('\n')) })] : []),
        ],
      },
    ],
  })
}
