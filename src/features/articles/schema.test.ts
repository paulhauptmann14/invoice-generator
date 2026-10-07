import { describe, expect, test } from 'vitest'
import { articleSchema } from './schema'

const base = { name: 'Rinderfilet', description: '', unit: 'kg', unitPriceGross: '54,90', vatRate: '7' }

describe('articleSchema', () => {
  test('parses German prices and the VAT rate', () => {
    expect(articleSchema.parse(base)).toEqual({ name: 'Rinderfilet', description: null, unit: 'kg', unitPriceGross: 54.9, vatRate: 7 })
    expect(articleSchema.parse({ ...base, unitPriceGross: '1.234,50' }).unitPriceGross).toBe(1234.5)
  })
  test('allows negative prices (e.g. deposit refunds)', () => {
    expect(articleSchema.parse({ ...base, unitPriceGross: '-0,25' }).unitPriceGross).toBe(-0.25)
  })
  test.each([
    ['', 'Bitte einen Preis wie 24,90 eingeben.'],
    ['abc', 'Bitte einen Preis wie 24,90 eingeben.'],
    ['1,234', 'Höchstens zwei Nachkommastellen.'],
    ['1000000', 'Der Preis ist zu hoch.'],
  ])('rejects price %s', (price, message) => {
    const r = articleSchema.safeParse({ ...base, unitPriceGross: price })
    expect(r.error?.issues[0]).toMatchObject({ path: ['unitPriceGross'], message })
  })
  test('rejects unknown VAT rates', () => {
    const r = articleSchema.safeParse({ ...base, vatRate: '16' })
    expect(r.error?.issues[0]).toMatchObject({ path: ['vatRate'], message: 'Bitte einen Steuersatz auswählen.' })
  })
  test('requires a name', () => {
    const r = articleSchema.safeParse({ ...base, name: '' })
    expect(r.error?.issues[0]).toMatchObject({ path: ['name'], message: 'Bitte eine Bezeichnung eingeben.' })
  })
})
