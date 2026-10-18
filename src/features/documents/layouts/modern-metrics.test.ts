import { describe, expect, test } from 'vitest'
import { themeSchema } from '@/lib/domain/theme'
import { din5008 } from '../din5008'
import { modernHead } from './modern-metrics'

const NAME = 'Gasthaus Beispiel'
const PT = 25.4 / 72
const logo = (width: number, height: number) => ({ type: 'png' as const, width, height, data: Buffer.alloc(0) })

describe('modernHead', () => {
  test('the accent rule stays above the address field in form A and B', () => {
    for (const form of ['A', 'B'] as const) {
      const theme = themeSchema.parse({ layout: 'modern', page: { din5008: form } })
      expect(modernHead(theme, null, NAME).ruleTopMm).toBeLessThan(din5008(form).addressTopMm)
    }
  })
  test('the company name is larger than the title', () => {
    const theme = themeSchema.parse({ layout: 'modern' })
    expect(modernHead(theme, null, NAME).nameSizePt).toBeGreaterThan(theme.font.headingSizePt)
  })
  test('a tall logo is scaled down to fit above the rule, keeping its aspect ratio', () => {
    const theme = themeSchema.parse({ layout: 'modern', logo: { widthMm: 60 } })
    const head = modernHead(theme, logo(100, 100), NAME)
    expect(head.logoHeightMm).toBeLessThanOrEqual(head.ruleTopMm - theme.page.marginTopMm)
    expect(head.logoWidthMm).toBeCloseTo(head.logoHeightMm)
  })
  test('a wide logo keeps the configured width and narrows the company name', () => {
    const theme = themeSchema.parse({ layout: 'modern', logo: { widthMm: 40 } })
    const withLogo = modernHead(theme, logo(400, 100), NAME)
    expect(withLogo.logoWidthMm).toBe(40)
    expect(withLogo.logoHeightMm).toBe(10)
    expect(withLogo.nameWidthMm).toBeLessThan(modernHead(theme, null, NAME).nameWidthMm)
  })
  test('large top margins never give negative logo sizes or a rule above the name (form A)', () => {
    const theme = themeSchema.parse({ layout: 'modern', page: { din5008: 'A', marginTopMm: 30 } })
    const head = modernHead(theme, logo(100, 100), NAME)
    expect(head.logoWidthMm).toBeGreaterThanOrEqual(0)
    expect(head.logoHeightMm).toBeGreaterThanOrEqual(0)
    expect(head.ruleTopMm).toBeGreaterThan(theme.page.marginTopMm + head.nameSizePt * 1.1 * PT)
  })
  test('long names and large headings shrink the name so it stays on one line above the rule', () => {
    const theme = themeSchema.parse({ layout: 'modern', font: { headingSizePt: 28 } })
    const short = modernHead(theme, null, NAME)
    const long = modernHead(theme, null, 'Gasthaus und Metzgerei zum Goldenen Hirschen Inh. Maximilian Mustermann')
    expect(long.nameSizePt).toBeLessThan(short.nameSizePt)
    expect(long.nameSizePt).toBeGreaterThanOrEqual(10)
    for (const head of [short, long]) expect(theme.page.marginTopMm + head.nameSizePt * 1.1 * PT).toBeLessThan(head.ruleTopMm)
  })
})
