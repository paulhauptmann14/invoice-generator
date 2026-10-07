import { describe, expect, test } from 'vitest'
import { formatIban, missingCompanyFields, parseCompany } from './company'

describe('company', () => {
  test('empty company data', () => {
    const c = parseCompany({})
    expect(c.name).toBe('')
    expect(c.country).toBe('Deutschland')
    expect(missingCompanyFields(c)).toEqual(['Firmenname', 'Straße', 'PLZ', 'Ort', 'Steuernummer oder USt-IdNr.'])
  })
  test('complete with tax number', () => {
    const c = parseCompany({ name: 'Gasthaus', street: 'Hauptstr. 1', postalCode: '12345', city: 'Ort', taxNumber: '12/345/67890' })
    expect(missingCompanyFields(c)).toEqual([])
  })
  test('VAT ID replaces the tax number', () => {
    const c = parseCompany({ name: 'G', street: 'S', postalCode: '1', city: 'O', vatId: 'DE123456789' })
    expect(missingCompanyFields(c)).toEqual([])
  })
  test('whitespace does not count as a value', () => {
    const c = parseCompany({ name: '   ' })
    expect(missingCompanyFields(c)).toContain('Firmenname')
  })
  test('formatIban groups into blocks of four', () => {
    expect(formatIban('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00')
    expect(formatIban('DE89 3704 0044 0532 0130 00')).toBe('DE89 3704 0044 0532 0130 00')
  })
})
