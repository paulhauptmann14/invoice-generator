import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip as twip,
  Document,
  Footer,
  FrameAnchorType,
  FrameWrap,
  Header,
  HeightRule,
  type IParagraphOptions,
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

const PAGE = { widthMm: 210, heightMm: 297 }
const hex = (color: string) => color.replace('#', '')
const halfPoints = (pt: number) => Math.round(pt * 2)
// Line height as a minimum in points (like react-pdf: font size × factor). Word's "auto" factor would multiply the
// font's own, larger line height and spread everything out compared to the PDF.
const lineHeight = (fontPt: number, factor: number) => ({ line: Math.round(fontPt * factor * 20), lineRule: LineRuleType.AT_LEAST })
const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }

/** Text frame anchored to the page (mm), used for the DIN 5008 elements. */
function frame(xMm: number, yMm: number, widthMm: number, heightMm?: number): IParagraphOptions['frame'] {
  return {
    type: 'absolute',
    position: { x: twip(xMm), y: twip(yMm) },
    width: twip(widthMm),
    ...(heightMm ? { height: twip(heightMm), rule: HeightRule.EXACT } : {}),
    anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
    wrap: FrameWrap.NONE,
  }
}

/** Lines as one paragraph with line breaks (keeps a frame in one piece). */
const lines = (texts: string[], run: { bold?: boolean; size?: number; color?: string } = {}) =>
  texts.map((text, i) => new TextRun({ text, break: i > 0 ? 1 : 0, ...run }))

type Column = { label: string; pct: number; align: (typeof AlignmentType)[keyof typeof AlignmentType]; value: (item: InvoiceViewModel['items'][number]) => string }

/** Layout "Klassisch" as an editable Word document. Displays view-model strings only, no calculations. */
export function buildKlassischDocx(vm: InvoiceViewModel, theme: Theme, fontFamily: string): Document {
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const contentWidthMm = PAGE.widthMm - page.marginLeftMm - page.marginRightMm
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 8.46
  const L = theme.table.labels

  const fixedColumns: (Column | false)[] = [
    theme.table.showPosition && { label: L.position, pct: 7, align: AlignmentType.LEFT, value: (i) => String(i.position) },
    { label: L.quantity, pct: 9, align: AlignmentType.RIGHT, value: (i) => i.quantity },
    theme.table.showUnit && { label: L.unit, pct: 9, align: AlignmentType.LEFT, value: (i) => i.unit },
    { label: L.unitPrice, pct: 15, align: AlignmentType.RIGHT, value: (i) => i.unitPrice },
    theme.table.showVatRate && { label: L.vatRate, pct: 9, align: AlignmentType.RIGHT, value: (i) => i.vatRate },
    { label: L.total, pct: 15, align: AlignmentType.RIGHT, value: (i) => i.total },
  ]
  const others = fixedColumns.filter((col): col is Column => col !== false)
  const description: Column = {
    label: L.description,
    pct: 100 - others.reduce((sum, col) => sum + col.pct, 0),
    align: AlignmentType.LEFT,
    value: (i) => i.description,
  }
  // Description is second when the position column is shown, otherwise first (same order as the PDF).
  const columns = theme.table.showPosition ? [others[0], description, ...others.slice(1)] : [description, ...others]
  const widthOf = (col: Column) => twip((contentWidthMm * col.pct) / 100)

  const cell = (col: Column, text: string, opts: { header?: boolean; zebra?: boolean }) =>
    new TableCell({
      width: { size: widthOf(col), type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      shading: opts.header
        ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(c.tableHeaderBg) }
        : opts.zebra
          ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(DOCUMENT_COLORS.zebra) }
          : undefined,
      borders: {
        top: NONE,
        left: NONE,
        right: NONE,
        bottom: opts.header ? NONE : { style: BorderStyle.SINGLE, size: 4, color: hex(DOCUMENT_COLORS.rule) },
      },
      children: [new Paragraph({ alignment: col.align, children: [new TextRun({ text, bold: opts.header, color: opts.header ? hex(c.primary) : undefined })] })],
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
            margins: { top: strong ? 80 : 20, bottom: 20, left: 80, right: 80 },
            children: [
              new Paragraph({
                alignment: idx === 1 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [new TextRun({ text, bold: strong, size: strong ? halfPoints(base + 1.5) : undefined, color: strong ? hex(c.primary) : undefined })],
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
              bottom: twip(page.marginBottomMm + 20),
              left: twip(page.marginLeftMm),
              header: twip(5),
              footer: twip(page.marginBottomMm - 6),
            },
          },
        },
        headers: { default: new Header({ children: [mark(din.foldMarksMm[0]), mark(din.punchMarkMm, 6), mark(din.foldMarksMm[1])] }) },
        footers: { default: new Footer({ children: [footerTable, pageNumber] }) },
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
          ...infoRows.map(
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
            spacing: { ...lineHeight(theme.font.headingSizePt, 1.15), after: twip(5) },
            children: [
              new TextRun({ text: vm.title, bold: true, size: halfPoints(theme.font.headingSizePt), color: hex(c.primary) }),
              ...(vm.number !== '' ? [new TextRun({ text: ` ${vm.number}`, size: halfPoints(theme.font.headingSizePt), color: hex(c.primary) })] : []),
            ],
          }),
          ...(vm.intro !== '' ? [new Paragraph({ spacing: { after: twip(5) }, children: lines(vm.intro.split('\n')) })] : []),
          itemsTable,
          // Small fixed gap between table and totals (an empty paragraph would take a full line).
          new Paragraph({ spacing: { line: twip(3), lineRule: LineRuleType.EXACTLY, after: 0 }, children: [] }),
          totalsTable,
          ...(vm.paymentNote !== ''
            ? [new Paragraph({ keepNext: true, spacing: { before: twip(8), after: twip(5) }, children: lines(vm.paymentNote.split('\n')) })]
            : []),
          ...(vm.closing !== '' ? [new Paragraph({ children: lines(vm.closing.split('\n')) })] : []),
        ],
      },
    ],
  })
}
