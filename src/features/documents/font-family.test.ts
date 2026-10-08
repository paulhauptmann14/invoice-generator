import { expect, test } from 'vitest'
import { themeSchema } from '@/lib/domain/theme'
import { resolveFontFamily } from './font-family'

test('built-in font from the theme', () => {
  expect(resolveFontFamily(themeSchema.parse({ font: { builtin: 'Merriweather' } }))).toBe('Merriweather')
})
test('custom fonts (M9) fall back to IBM Plex Sans for now', () => {
  expect(resolveFontFamily(themeSchema.parse({ font: { source: 'custom' } }))).toBe('IBM Plex Sans')
})
