import { describe, expect, it } from 'vitest'
import { applySelection, isCustomUnit, isListedUnit, OTHER_UNIT, selectValueFor, UNITS } from './units'

describe('units', () => {
  it('lists the units in display order', () => {
    expect([...UNITS]).toEqual(['Stk.', 'kg', 'g', 'l', 'Fl.', 'Portion', 'Pers.', 'Std.', 'Pauschale'])
  })

  it('recognises listed units exactly', () => {
    expect(isListedUnit('kg')).toBe(true)
    expect(isListedUnit('Pauschale')).toBe(true)
    expect(isListedUnit('KG')).toBe(false)
    expect(isListedUnit('Gutschein')).toBe(false)
    expect(isListedUnit('')).toBe(false)
  })

  it('treats only non-empty unlisted values as custom', () => {
    expect(isCustomUnit('Gutschein')).toBe(true)
    expect(isCustomUnit('')).toBe(false)
    expect(isCustomUnit('Stk.')).toBe(false)
  })

  it('maps a stored value to the dropdown option', () => {
    expect(selectValueFor('', false)).toBe('')
    expect(selectValueFor('kg', false)).toBe('kg')
    expect(selectValueFor('Gutschein', false)).toBe(OTHER_UNIT)
    expect(selectValueFor('', true)).toBe(OTHER_UNIT)
    // typing a listed unit into the custom field keeps the custom input open
    expect(selectValueFor('kg', true)).toBe(OTHER_UNIT)
  })

  it('applies a selection: "Andere" clears the text, a list unit leaves custom mode', () => {
    expect(applySelection(OTHER_UNIT)).toEqual({ value: '', customMode: true })
    expect(applySelection('kg')).toEqual({ value: 'kg', customMode: false })
    expect(applySelection('')).toEqual({ value: '', customMode: false })
  })
})
