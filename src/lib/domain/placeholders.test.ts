import { expect, test } from 'vitest'
import { fillPlaceholders } from './placeholders'

test('replaces known placeholders, including repeated ones', () => {
  expect(fillPlaceholders('Rechnung {Nr} für {Kunde} ({Nr})', { Nr: '2026-0001', Kunde: 'Müller' })).toBe(
    'Rechnung 2026-0001 für Müller (2026-0001)',
  )
})
test('keeps unknown placeholders', () => {
  expect(fillPlaceholders('Hallo {Foo}', {})).toBe('Hallo {Foo}')
})
test('does not replace recursively', () => {
  expect(fillPlaceholders('{Kunde}', { Kunde: '{Nr}', Nr: 'X' })).toBe('{Nr}')
})
test('supports umlauts in placeholder names', () => {
  expect(fillPlaceholders('{Fällig}', { Fällig: '21.10.2026' })).toBe('21.10.2026')
})
