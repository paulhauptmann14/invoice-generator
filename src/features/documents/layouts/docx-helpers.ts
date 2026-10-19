import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip as twip,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  type IParagraphOptions,
  LineRuleType,
  TextRun,
} from 'docx'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'

// Shared building blocks for the Word layouts (findings from the M8 spike, see roadmap).
export const PAGE = { widthMm: 210, heightMm: 297 }
export const hex = (color: string) => color.replace('#', '')
export const halfPoints = (pt: number) => Math.round(pt * 2)
/** EMU (English Metric Units) for drawings: 1 mm = 36 000 EMU. */
export const emu = (mm: number) => Math.round(mm * 36000)
// Line height as a minimum in points (like react-pdf: font size × factor). Word's "auto" factor would multiply the
// font's own, larger line height and spread everything out compared to the PDF.
export const lineHeight = (fontPt: number, factor: number) => ({ line: Math.round(fontPt * factor * 20), lineRule: LineRuleType.AT_LEAST })
export const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' } as const
// Word draws grid lines on tables unless every border is switched off explicitly.
export const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }

/** Text frame anchored to the page (mm), used for the DIN 5008 elements. */
export function frame(xMm: number, yMm: number, widthMm: number, heightMm?: number): IParagraphOptions['frame'] {
  return {
    type: 'absolute',
    position: { x: twip(xMm), y: twip(yMm) },
    width: twip(widthMm),
    ...(heightMm ? { height: twip(heightMm), rule: HeightRule.EXACT } : {}),
    anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
    wrap: FrameWrap.NONE,
  }
}

/** Lines as one paragraph with line breaks (keeps a frame in one piece). Split multi-line user text with `text.split('\n')`. */
export const lines = (texts: string[], run: { bold?: boolean; size?: number; color?: string } = {}) =>
  texts.map((text, i) => new TextRun({ text, break: i > 0 ? 1 : 0, ...run }))

/** Empty paragraph of exact height: Word drops spacing.before at the top of a page (M8 spike). */
export const spacer = (heightMm: number) => ({ spacing: { line: twip(heightMm), lineRule: LineRuleType.EXACTLY, after: 0 }, children: [] })

export type Column = {
  label: string
  pct: number
  align: (typeof AlignmentType)[keyof typeof AlignmentType]
  value: (item: InvoiceViewModel['items'][number]) => string
  /** Optional second, smaller line below the value (item discount in the description column). */
  detail?: (item: InvoiceViewModel['items'][number]) => string | null
}

/** Columns of the items table (Klassisch, Kompakt, Modern) in the same order and widths as the PDF. */
export function itemColumns(theme: Theme): Column[] {
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
    detail: (i) => i.discount,
  }
  // Description is second when the position column is shown, otherwise first (same order as the PDF).
  return theme.table.showPosition ? [others[0], description, ...others.slice(1)] : [description, ...others]
}
