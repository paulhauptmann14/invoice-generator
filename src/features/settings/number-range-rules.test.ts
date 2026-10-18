import { describe, expect, test } from 'vitest'
import { archiveBlockReason, exampleNumber } from './number-range-rules'

const range = (id: string, isDefault: boolean, archived = false) => ({ id, name: id, format: '{N}', isDefault, archived })

describe('archiveBlockReason', () => {
  test('the default range cannot be archived', () => {
    expect(archiveBlockReason([range('a', true), range('b', false)], 'a')).toBe('Erst einen anderen Kreis als Standard festlegen.')
  })
  test('a non-default range can be archived', () => {
    expect(archiveBlockReason([range('a', true), range('b', false)], 'b')).toBeNull()
  })
  test('the last active range stays', () => {
    expect(archiveBlockReason([range('a', false), range('b', false, true)], 'a')).toBe('Mindestens ein Nummernkreis muss aktiv bleiben.')
  })
})

describe('exampleNumber', () => {
  test('first number of the year', () => expect(exampleNumber('GU{N}/{JJ}', 2026)).toBe('GU1/26'))
  test('invalid format -> empty', () => expect(exampleNumber('G/{JJ}', 2026)).toBe(''))
})
