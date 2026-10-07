import { describe, expect, test } from 'vitest'
import { divRound, formatEuro, formatQuantity, formatVatRate, toCents, toMilli, toRateBp } from './money'

const NBSP = ' '

describe('toCents', () => {
  test.each([
    [24.9, 2490],
    ['24,90', 2490],
    ['1234.5', 123450],
    [-3.5, -350],
    [0, 0],
  ])('%s -> %i', (input, expected) => {
    expect(toCents(input)).toBe(expected)
  })
  test('throws on invalid input', () => {
    expect(() => toCents('abc')).toThrow('Invalid number')
    expect(() => toCents('  ')).toThrow('Invalid number')
  })
})

describe('toMilli', () => {
  test.each([
    [1.5, 1500],
    ['0,125', 125],
    ['2', 2000],
  ])('%s -> %i', (input, expected) => {
    expect(toMilli(input)).toBe(expected)
  })
})

describe('toRateBp', () => {
  test.each([
    [7, 700],
    ['19.00', 1900],
    ['10,7', 1070],
    [0, 0],
  ])('%s -> %i', (input, expected) => {
    expect(toRateBp(input)).toBe(expected)
  })
})

describe('divRound (half away from zero)', () => {
  test.each([
    [5, 2, 3],
    [-5, 2, -3],
    [4, 3, 1],
    [7, 2, 4],
    [10, 5, 2],
  ])('%i / %i -> %i', (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected)
  })
  test('returns +0 instead of -0', () => {
    expect(Object.is(divRound(-1, 3), 0)).toBe(true)
  })
  test('throws when the denominator is not positive', () => {
    expect(() => divRound(1, 0)).toThrow()
  })
})

describe('de-DE formatting', () => {
  test('formatEuro', () => {
    expect(formatEuro(123450)).toBe(`1.234,50${NBSP}€`)
    expect(formatEuro(0)).toBe(`0,00${NBSP}€`)
    expect(formatEuro(5)).toBe(`0,05${NBSP}€`)
  })
  test('formatQuantity', () => {
    expect(formatQuantity(1.5)).toBe('1,5')
    expect(formatQuantity('2.000')).toBe('2')
    expect(formatQuantity(0.125)).toBe('0,125')
    expect(formatQuantity(1234)).toBe('1.234')
  })
  test('formatVatRate', () => {
    expect(formatVatRate(7)).toBe('7 %')
    expect(formatVatRate('19.00')).toBe('19 %')
    expect(formatVatRate(10.7)).toBe('10,7 %')
  })
})
