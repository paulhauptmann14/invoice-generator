import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip as twip,
  Document,
  Footer,
  Header,
  LineRuleType,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from 'docx'
import { DOCUMENT_COLORS, type Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { din5008 } from '../din5008'

import { type Column, frame, halfPoints, hex, itemColumns, lineHeight, lines, NO_BORDERS, NONE, PAGE } from './docx-helpers'
import { bankDetails, type Density, FOOTER_ROOM_MM, oneLine } from './density'


/** Layout "Klassisch" (and "Kompakt", density "compact") as an editable Word document. View-model strings only. */
export function buildKlassischDocx(vm: InvoiceViewModel, theme: Theme, fontFamily: string, density: Density = 'normal'): Document {
  const compact = density === 'compact'
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const rowSize = compact ? Math.max(7, base - 1) : base
  const headingSize = compact ? Math.max(10, theme.font.headingSizePt * 0.75) : theme.font.headingSizePt
  const contentWidthMm = PAGE.widthMm - page.marginLeftMm - page.marginRightMm
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 8.46

  const columns = itemColumns(theme)
  const widthOf = (col: Column) => twip((contentWidthMm * col.pct) / 100)

  const cell = (col: Column, text: string, opts: { header?: boolean; zebra?: boolean }) =>
    new TableCell({
      width: { size: widthOf(col), type: WidthType.DXA },
      margins: compact ? { top: 20, bottom: 20, left: 80, right: 80 } : { top: 60, bottom: 60, left: 80, right: 80 },
      shading: opts.header
        ? compact
          ? undefined
          : { type: ShadingType.CLEAR, color: 'auto', fill: hex(c.tableHeaderBg) }
        : opts.zebra
          ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(DOCUMENT_COLORS.zebra) }
          : undefined,
      borders: {
        top: NONE,
        left: NONE,
        right: NONE,
        bottom: opts.header
          ? compact
            ? { style: BorderStyle.SINGLE, size: 6, color: hex(c.primary) }
            : NONE
          : { style: BorderStyle.SINGLE, size: 4, color: hex(DOCUMENT_COLORS.rule) },
      },
      children: [
        new Paragraph({
          alignment: col.align,
          spacing: compact ? { ...lineHeight(rowSize, 1.25), after: 0 } : undefined,
          children: [new TextRun({ text, bold: opts.header, size: compact ? halfPoints(rowSize) : undefined, color: opts.header ? hex(c.primary) : undefined })],
        }),
      ],
    })

  const itemsTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: twip(contentWidthMm), type: WidthType.DXA },
    columnWidths: columns.map(widthOf),
    borders: NO_BORDERS,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: columns.map((col) => cell(col, col.label, { header: true })) }),
      ...vm.items.map(
        (item, i) =>
          new TableRow({ cantSplit: true, children: columns.map((col) => cell(col, col.value(item), { zebra: c.zebra && i % 2 === 1 })) }),
      ),
    ],
  })

  const totalsRow = (label: string, value: string, strong = false) =>
    new TableRow({
      cantSplit: true,
      children: [label, value].map(
        (text, idx) =>
          new TableCell({
            borders: { ...NO_BORDERS, top: strong ? { style: BorderStyle.SINGLE, size: 8, color: hex(c.primary) } : NONE },
            margins: { top: strong ? 80 : compact ? 10 : 20, bottom: compact ? 10 : 20, left: 80, right: 80 },
            children: [
              new Paragraph({
                alignment: idx === 1 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [new TextRun({ text, bold: strong, size: halfPoints(strong ? rowSize + 1.5 : rowSize), color: strong ? hex(c.primary) : undefined })],
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
      ...vm.taxGroups.flatMap((g) => [totalsRow(`Nettobetrag ${g.rate}`, g.net), totalsRow(`MwSt. ${g.rate}`, g.vat)]),
      totalsRow('Gesamtbetrag', vm.totals.gross, true),
    ],
  })

  const infoRows: [string, string][] = [
    ['Rechnungsnr.', vm.number],
    ['Rechnungsdatum', vm.issueDate],
    ['Leistungsdatum', vm.serviceDate],
    ...(vm.dueDate ? ([['Fällig am', vm.dueDate]] as [string, string][]) : []),
    ...(vm.recipientVatId ? ([['Ihre USt-IdNr.', vm.recipientVatId]] as [string, string][]) : []),
  ]
  const infoWidthMm = 70
  const infoXMm = PAGE.widthMm - page.marginRightMm - infoWidthMm

  // Kompakt: one (wrapping) line instead of columns.
  const compactFooter = new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(c.primary), space: 3 } },
    spacing: lineHeight(6.5, 1.3),
    children: vm.footerColumns.map((col, i) => new TextRun({ text: `${i > 0 ? '\u2003\u2003' : ''}${oneLine(col)}`, size: halfPoints(6.5), color: hex(c.primary) })),
  })
  // Autofit: footer columns size by content so long lines (IBAN) do not wrap.
  const footerTable = new Table({
    layout: TableLayoutType.AUTOFIT,
    width: { size: twip(contentWidthMm), type: WidthType.DXA },
    borders: { ...NO_BORDERS, top: { style: BorderStyle.SINGLE, size: 4, color: hex(c.primary) } },
    rows: [
      new TableRow({
        children: (vm.footerColumns.length > 0 ? vm.footerColumns : ['']).map(
          (col) =>
            new TableCell({
              margins: { top: 80, left: 0, right: 120 },
              children: [new Paragraph({ spacing: lineHeight(7, 1.4), children: lines(col.split('\n'), { size: halfPoints(7), color: hex(c.primary) }) })],
            }),
        ),
      }),
    ],
  })
  const pageNumber = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 60 },
    children: [
      new TextRun({ children: ['Seite ', PageNumber.CURRENT, ' von ', PageNumber.TOTAL_PAGES], size: halfPoints(7), color: hex(c.primary) }),
    ],
  })

  // Fold and punch marks (DIN 5008), on every page via the header (spike: Word places them reliably).
  const mark = (yMm: number, widthMm = 4) =>
    new Paragraph({ frame: frame(5, yMm, widthMm, 0.5), border: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(DOCUMENT_COLORS.mark) } }, children: [] })

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
              bottom: twip(page.marginBottomMm + FOOTER_ROOM_MM[density]),
              left: twip(page.marginLeftMm),
              header: twip(5),
              footer: twip(page.marginBottomMm - 6),
            },
          },
        },
        headers: { default: new Header({ children: [mark(din.foldMarksMm[0]), mark(din.punchMarkMm, 6), mark(din.foldMarksMm[1])] }) },
        footers: { default: new Footer({ children: [compact ? compactFooter : footerTable, pageNumber] }) },
        children: [
          // DIN 5008 elements in page-anchored frames.
          new Paragraph({
            frame: frame(PAGE.widthMm - page.marginRightMm - 90, page.marginTopMm, 90),
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: vm.companyName, bold: true, size: halfPoints(base + 3), color: hex(c.primary) })],
          }),
          ...(page.senderLine && vm.senderLine !== ''
            ? [
                new Paragraph({
                  frame: frame(din.addressLeftMm, din.addressTopMm + din.endorsementZoneMm - 4.5, din.addressWidthMm, 4.5),
                  children: [new TextRun({ text: vm.senderLine, size: halfPoints(7), color: hex(c.primary), underline: {} })],
                }),
              ]
            : []),
          new Paragraph({
            frame: frame(din.addressLeftMm, din.addressTopMm + din.endorsementZoneMm, din.addressWidthMm, din.addressHeightMm - din.endorsementZoneMm),
            children: lines(vm.recipientLines),
          }),
          ...(compact ? [] : infoRows).map(
            ([label, value]) =>
              new Paragraph({
                frame: frame(infoXMm, din.infoTopMm, infoWidthMm),
                tabStops: [{ type: TabStopType.RIGHT, position: twip(infoWidthMm) }],
                children: [new TextRun({ text: label, color: hex(c.primary) }), new TextRun({ text: `\t${value}` })],
              }),
          ),
          // Body starts two lines below the address field. Word drops spacing.before at the top of a page
          // (spike), so an empty paragraph with an exact line height reserves the letterhead/address area.
          new Paragraph({ spacing: { line: twip(bodyTopMm - page.marginTopMm), lineRule: LineRuleType.EXACTLY, after: 0 }, children: [] }),
          new Paragraph({
            spacing: { ...lineHeight(headingSize, 1.15), after: twip(compact ? 1.5 : 5) },
            children: [
              new TextRun({ text: vm.title, bold: true, size: halfPoints(headingSize), color: hex(c.primary) }),
              ...(vm.number !== '' ? [new TextRun({ text: ` ${vm.number}`, size: halfPoints(headingSize), color: hex(c.primary) })] : []),
            ],
          }),
          // Kompakt: number, dates and due date in one line below the title instead of the info block.
          ...(compact
            ? [
                new Paragraph({
                  spacing: { after: twip(4) },
                  children: infoRows.slice(1).flatMap(([label, value], i) => [
                    new TextRun({ text: `${i > 0 ? '\u2003\u2003' : ''}${label} `, color: hex(c.primary) }),
                    new TextRun({ text: value }),
                  ]),
                }),
              ]
            : []),
          ...(vm.intro !== '' ? [new Paragraph({ spacing: { after: twip(compact ? 3 : 5) }, children: lines(vm.intro.split('\n')) })] : []),
          itemsTable,
          // Small fixed gap between table and totals (an empty paragraph would take a full line).
          new Paragraph({ spacing: { line: twip(3), lineRule: LineRuleType.EXACTLY, after: 0 }, children: [] }),
          totalsTable,
          ...(vm.paymentNote !== ''
            ? [new Paragraph({ keepNext: true, spacing: { before: twip(compact ? 5 : 8), after: twip(vm.bankAccounts.length > 0 ? 1.5 : compact ? 3 : 5) }, children: lines(vm.paymentNote.split('\n')) })]
            : []),
          ...vm.bankAccounts.map(
            (b, i) =>
              new Paragraph({
                keepNext: true,
                spacing: { after: i === vm.bankAccounts.length - 1 ? twip(compact ? 3 : 5) : 0 },
                children: [...(b.bank !== '' ? [new TextRun({ text: `${b.bank}\u2003`, bold: true })] : []), new TextRun({ text: bankDetails(b.rows) })],
              }),
          ),
          ...(vm.closing !== '' ? [new Paragraph({ children: lines(vm.closing.split('\n')) })] : []),
        ],
      },
    ],
  })
}
