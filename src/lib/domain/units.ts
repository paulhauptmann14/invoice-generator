/** Units offered in the unit dropdown (articles and invoice items), in display order. */
export const UNITS = ['Stk.', 'kg', 'g', 'l', 'Fl.', 'Portion', 'Pers.', 'Std.', 'Pauschale'] as const

/** Maximum length of a unit string (same limit as the schemas). */
export const UNIT_MAX_LENGTH = 20

/** Select value of the "Andere …" option; never submitted as a unit. */
export const OTHER_UNIT = '__other__'

export function isListedUnit(value: string): boolean {
  return (UNITS as readonly string[]).includes(value)
}

/** True when the stored value is a unit the list does not offer (e.g. "Gutschein"), so the custom text input is needed. */
export function isCustomUnit(value: string): boolean {
  return value !== '' && !isListedUnit(value)
}

/** The option the dropdown shows: '' (no unit), a listed unit, or "Andere …" while custom mode is on or the value is unlisted. */
export function selectValueFor(value: string, customMode: boolean): string {
  return customMode || isCustomUnit(value) ? OTHER_UNIT : value
}

/** What happens when the user picks an option: "Andere …" starts with empty custom text, anything else leaves custom mode. */
export function applySelection(selected: string): { value: string; customMode: boolean } {
  return selected === OTHER_UNIT ? { value: '', customMode: true } : { value: selected, customMode: false }
}
