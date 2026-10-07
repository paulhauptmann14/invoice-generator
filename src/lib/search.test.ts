import { describe, expect, test } from 'vitest'
import { escapeLike, normalizeSearch } from './search'

describe('normalizeSearch', () => {
  test('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeSearch('  Müller   GmbH ')).toBe('müller gmbh')
  })
  test('handles missing and array params', () => {
    expect(normalizeSearch(undefined)).toBe('')
    expect(normalizeSearch(['Abc', 'x'])).toBe('abc')
  })
  test('limits length to 100 characters', () => {
    expect(normalizeSearch('a'.repeat(300))).toHaveLength(100)
  })
})

describe('escapeLike', () => {
  test('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})
