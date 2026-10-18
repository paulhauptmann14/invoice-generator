import { describe, expect, test } from 'vitest'
import { defaultTheme, IMPLEMENTED_LAYOUTS, LAYOUTS, parseTheme, readableTextOn, themeSchema } from './theme'

describe('theme', () => {
  test('an empty object yields complete defaults, including nested values', () => {
    const t = parseTheme({})
    expect(t).toEqual(defaultTheme)
    expect(t.layout).toBe('briefpapier')
    expect(t.page.din5008).toBe('B')
    expect(t.table.labels.total).toBe('Gesamt')
    expect(t.texts.footerColumns).toEqual([])
  })
  test('partial values are merged with defaults', () => {
    const t = parseTheme({ colors: { primary: '#000000' } })
    expect(t.colors.primary).toBe('#000000')
    expect(t.colors.accent).toBe(defaultTheme.colors.accent)
  })
  test('invalid values: the schema reports an error, parseTheme falls back to defaults', () => {
    expect(themeSchema.safeParse({ colors: { primary: 'red' } }).success).toBe(false)
    expect(parseTheme({ colors: { primary: 'red' } })).toEqual(defaultTheme)
    expect(parseTheme(null)).toEqual(defaultTheme)
  })
  test('at most 4 footer columns', () => {
    expect(themeSchema.safeParse({ texts: { footerColumns: ['a', 'b', 'c', 'd', 'e'] } }).success).toBe(false)
  })
  test('"Briefpapier" is the default layout; all layouts are implemented', () => {
    expect(defaultTheme.layout).toBe('briefpapier')
    expect(IMPLEMENTED_LAYOUTS).toEqual(LAYOUTS)
  })
  test('the default accent color is not red (the user rejected red accents)', () => {
    expect(defaultTheme.colors.accent).toBe('#1F5F74')
  })
  test('readableTextOn picks white or ink, whichever contrasts more with the background', () => {
    expect(readableTextOn('#1F5F74')).toBe('#FFFFFF')
    expect(readableTextOn('#17191C')).toBe('#FFFFFF')
    expect(readableTextOn('#F2C94C')).toBe('#17191C')
    expect(readableTextOn('#FFFFFF')).toBe('#17191C')
  })
  test('default texts follow the business template', () => {
    expect(defaultTheme.texts.intro).toBe('')
    expect(defaultTheme.texts.closing).toBe('')
    expect(defaultTheme.texts.paymentNote).toBe('Wir bitten höflich um Überweisung bis zum {Faellig} auf eines unserer nachfolgend genannten Konten:')
    expect(defaultTheme.texts.paymentNoteWithoutDueDate).toBe('Wir bitten höflich um Überweisung auf eines unserer nachfolgend genannten Konten:')
  })
})
