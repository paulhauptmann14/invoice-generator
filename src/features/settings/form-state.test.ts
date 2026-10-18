import { describe, expect, test } from 'vitest'
import { fieldId, getIn, setIn } from './form-state'

describe('setIn / getIn', () => {
  const draft = { name: 'A', bankAccounts: [{ iban: 'X', bic: 'Y' }], page: { senderLine: true } }

  test('sets a top-level field without touching the original', () => {
    const next = setIn(draft, 'name', 'B')
    expect(next.name).toBe('B')
    expect(draft.name).toBe('A')
    expect(next.bankAccounts).toBe(draft.bankAccounts)
  })
  test('sets a nested array field immutably', () => {
    const next = setIn(draft, 'bankAccounts.0.iban', 'DE89')
    expect(next.bankAccounts[0]).toEqual({ iban: 'DE89', bic: 'Y' })
    expect(draft.bankAccounts[0].iban).toBe('X')
    expect(Array.isArray(next.bankAccounts)).toBe(true)
  })
  test('sets nested object fields', () => {
    expect(setIn(draft, 'page.senderLine', false).page.senderLine).toBe(false)
  })
  test('reads values by path', () => {
    expect(getIn(draft, 'bankAccounts.0.bic')).toBe('Y')
    expect(getIn(draft, 'page.missing')).toBeUndefined()
  })
})

describe('fieldId', () => {
  test('turns a path into a valid element id', () => expect(fieldId('bankAccounts.0.iban')).toBe('set-bankAccounts-0-iban'))
  test('a prefix keeps several forms on one page apart', () => expect(fieldId('name', 'range-neu')).toBe('range-neu-name'))
})
