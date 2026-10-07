import { describe, expect, test } from 'vitest'
import { priceSchema, quantitySchema, vatRateSchema } from './input-schemas'

const msg = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message

describe('quantitySchema', () => {
  test.each([
    ['1', 1],
    ['0,5', 0.5],
    ['2,125', 2.125],
    ['-1', -1],
  ])('%s -> %s', (input, expected) => {
    expect(quantitySchema.parse(input)).toBe(expected)
  })
  test.each([
    ['', 'Bitte eine Menge wie 1 oder 0,5 eingeben.'],
    ['0', 'Die Menge darf nicht 0 sein.'],
    ['1,2345', 'Höchstens drei Nachkommastellen.'],
    ['100000', 'Die Menge ist zu groß.'],
  ])('rejects %s', (input, message) => {
    expect(msg(quantitySchema.safeParse(input))).toBe(message)
  })
})

describe('priceSchema / vatRateSchema', () => {
  test('price', () => {
    expect(priceSchema.parse('1.234,50')).toBe(1234.5)
    expect(msg(priceSchema.safeParse('1,234'))).toBe('Höchstens zwei Nachkommastellen.')
  })
  test('vat rate', () => {
    expect(vatRateSchema.parse('19')).toBe(19)
    expect(msg(vatRateSchema.safeParse('16'))).toBe('Bitte einen Steuersatz auswählen.')
  })
})
