import { describe, expect, test } from 'vitest'
import { isValidIban, normalizeIban } from './iban'

describe('normalizeIban', () => {
  test('removes spaces and upper-cases', () => expect(normalizeIban(' de89 3704 0044 0532 0130 00 ')).toBe('DE89370400440532013000'))
})

describe('isValidIban', () => {
  test('accepts a valid German IBAN with spaces', () => expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true))
  test('accepts lower case', () => expect(isValidIban('de89370400440532013000')).toBe(true))
  test('accepts a valid Austrian IBAN', () => expect(isValidIban('AT611904300234573201')).toBe(true))
  test('rejects a wrong check digit', () => expect(isValidIban('DE89370400440532013001')).toBe(false))
  test('rejects empty and malformed input', () => {
    expect(isValidIban('')).toBe(false)
    expect(isValidIban('DE89')).toBe(false)
    expect(isValidIban('1234567890123456')).toBe(false)
  })
})
