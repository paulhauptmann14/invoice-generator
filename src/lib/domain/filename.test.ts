import { describe, expect, test } from 'vitest'
import { buildFilename, normalizeUserFilename, sanitizeFilenamePart } from './filename'

describe('sanitizeFilenamePart', () => {
  test.each([
    ['Müller & Söhne', 'Mueller-Soehne'],
    ['Café Zürich', 'Cafe-Zuerich'],
    ['RE/2026/1', 'RE-2026-1'],
    ['Straße', 'Strasse'],
    ['   ', ''],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeFilenamePart(input)).toBe(expected)
  })
})

describe('buildFilename', () => {
  const ctx = { customer: 'Müller & Söhne GmbH', number: '2026-0001', issueDate: '2026-10-07' }
  test('default template', () => {
    expect(buildFilename('Rechnung_{Kunde}_{Nr}', ctx, 'pdf')).toBe('Rechnung_Mueller-Soehne-GmbH_2026-0001.pdf')
  })
  test('date and year placeholders', () => {
    expect(buildFilename('{Datum}_{Nr}', ctx, 'docx')).toBe('2026-10-07_2026-0001.docx')
    expect(buildFilename('{JJJJ}/{Kunde}', ctx, 'pdf')).toBe('2026-Mueller-Soehne-GmbH.pdf')
  })
  test('empty customer does not produce duplicate separators', () => {
    expect(buildFilename('Rechnung_{Kunde}_{Nr}', { ...ctx, customer: '' }, 'pdf')).toBe('Rechnung_2026-0001.pdf')
  })
  test('completely empty -> fallback name', () => {
    expect(buildFilename('{Kunde}', { ...ctx, customer: '' }, 'pdf')).toBe('Rechnung.pdf')
  })
  test('is truncated to 120 characters', () => {
    const name = buildFilename('{Kunde}', { ...ctx, customer: 'A'.repeat(300) }, 'pdf')
    expect(name).toBe(`${'A'.repeat(120)}.pdf`)
  })
})

describe('normalizeUserFilename', () => {
  test.each([
    ['Meine Rechnung.pdf', 'pdf', 'Meine-Rechnung.pdf'],
    ['x.PDF', 'pdf', 'x.pdf'],
    ['Angebot', 'docx', 'Angebot.docx'],
    ['', 'pdf', 'Rechnung.pdf'],
  ] as const)('%s (%s) -> %s', (input, ext, expected) => {
    expect(normalizeUserFilename(input, ext)).toBe(expected)
  })
})
