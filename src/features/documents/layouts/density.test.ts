import { expect, test } from 'vitest'
import { oneLine } from './density'

test('oneLine joins the non-empty lines of a footer column with commas', () => {
  expect(oneLine('Gasthaus Beispiel\nHauptstraße 1\n\n 12345 Musterstadt ')).toBe('Gasthaus Beispiel, Hauptstraße 1, 12345 Musterstadt')
})
