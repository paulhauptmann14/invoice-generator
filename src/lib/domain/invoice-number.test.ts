import { describe, expect, test } from 'vitest'
import { formatInvoiceNumber, suggestNextNumber, validateNumberFormat } from './invoice-number'

describe('validateNumberFormat', () => {
  test.each(['{JJJJ}-{NNNN}', 'RE-{NNNNN}', 'RE{JJ}/{NNN}'])('%s is valid', (f) => {
    expect(validateNumberFormat(f)).toBeNull()
  })
  test('invalid without a counter', () => {
    expect(validateNumberFormat('{JJJJ}')).toMatch('genau einen Zähler')
  })
  test('invalid with two counters', () => {
    expect(validateNumberFormat('{NN}-{NN}')).toMatch('genau einen Zähler')
  })
  test('names the unknown placeholder', () => {
    expect(validateNumberFormat('{XY}-{NNN}')).toMatch('{XY}')
  })
})

describe('formatInvoiceNumber', () => {
  test.each([
    ['{JJJJ}-{NNNN}', 2026, 1, '2026-0001'],
    ['RE{JJ}/{NNN}', 2027, 42, 'RE27/042'],
    ['{NN}', 2026, 123, '123'],
  ])('%s, %i, %i -> %s', (format, year, seq, expected) => {
    expect(formatInvoiceNumber(format, year, seq)).toBe(expected)
  })
})

describe('suggestNextNumber', () => {
  const existing = ['2026-0001', '2026-0007', '2025-0099', 'manuell-5', ' 2026-0003 ']
  test('first number of the year', () => {
    expect(suggestNextNumber('{JJJJ}-{NNNN}', 2026, [])).toBe('2026-0001')
  })
  test('highest matching number + 1; other years and manual numbers are ignored', () => {
    expect(suggestNextNumber('{JJJJ}-{NNNN}', 2026, existing)).toBe('2026-0008')
  })
  test('a new year starts at 1', () => {
    expect(suggestNextNumber('{JJJJ}-{NNNN}', 2027, existing)).toBe('2027-0001')
  })
  test('continuous numbering without year', () => {
    expect(suggestNextNumber('RE-{NNNNN}', 2026, ['RE-00009', 'RE-10'])).toBe('RE-00011')
  })
  test('special characters in the format are matched literally', () => {
    expect(suggestNextNumber('{JJJJ}.{NNN}', 2026, ['2026x001'])).toBe('2026.001')
  })
  test('missing or invalid format -> empty (manual entry)', () => {
    expect(suggestNextNumber(null, 2026, existing)).toBe('')
    expect(suggestNextNumber('{JJJJ}', 2026, existing)).toBe('')
  })
})
