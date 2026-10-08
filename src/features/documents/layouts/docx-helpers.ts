import {
  BorderStyle,
  convertMillimetersToTwip as twip,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  type IParagraphOptions,
  LineRuleType,
  TextRun,
} from 'docx'

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

/** Lines as one paragraph with line breaks (keeps a frame in one piece). */
export const lines = (texts: string[], run: { bold?: boolean; size?: number; color?: string } = {}) =>
  texts.map((text, i) => new TextRun({ text, break: i > 0 ? 1 : 0, ...run }))

/** Empty paragraph of exact height: Word drops spacing.before at the top of a page (M8 spike). */
export const spacer = (heightMm: number) => ({ spacing: { line: twip(heightMm), lineRule: LineRuleType.EXACTLY, after: 0 }, children: [] })
