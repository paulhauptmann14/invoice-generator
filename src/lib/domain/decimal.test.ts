import { describe, expect, test } from 'vitest'
import { formatDecimalInput, parseGermanDecimal } from './decimal'

describe('parseGermanDecimal', () => {
  test.each([
    ['24,90', 24.9],
    ['24.90', 24.9],
    ['1.234,50', 1234.5],
    ['1234,5', 1234.5],
    [' 7 ', 7],
    ['-3,50', -3.5],
    ['0', 0],
  ])('%s -> %s', (input, expected) => {
    expect(parseGermanDecimal(input)).toBe(expected)
  })
  test.each(['', 'abc', '1,2,3', '12,', ',5', '1.2.3', '--1'])('rejects %s', (input) => {
    expect(parseGermanDecimal(input)).toBeNull()
  })
})

describe('formatDecimalInput', () => {
  test('formats with comma and two decimals, no grouping', () => {
    expect(formatDecimalInput(24.9)).toBe('24,90')
    expect(formatDecimalInput(1234.5)).toBe('1234,50')
    expect(formatDecimalInput(-3.5)).toBe('-3,50')
  })
})
