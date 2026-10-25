import { expect, test } from 'vitest'
import { contentDisposition } from './content-disposition'

test('ASCII name', () => {
  expect(contentDisposition('attachment', 'Rechnung_A_2026-0001.pdf')).toBe(
    `attachment; filename="Rechnung_A_2026-0001.pdf"; filename*=UTF-8''Rechnung_A_2026-0001.pdf`,
  )
})
test('readable name: UTF-8 part keeps umlauts and spaces, ASCII fallback is transliterated', () => {
  expect(contentDisposition('attachment', 'Rechnung Müller 3.pdf')).toBe(
    `attachment; filename="Rechnung Mueller 3.pdf"; filename*=UTF-8''Rechnung%20M%C3%BCller%203.pdf`,
  )
})
test('quotes and backslashes never end up in the ASCII fallback', () => {
  expect(contentDisposition('inline', 'R"x\\y.pdf')).toBe(`inline; filename="R_x_y.pdf"; filename*=UTF-8''R%22x%5Cy.pdf`)
})
test('the UTF-8 part round-trips through decodeURIComponent', () => {
  const header = contentDisposition('attachment', 'Rechnung Metzgerei Müller & Söhne 2.pdf')
  const match = /filename\*=UTF-8''([^;]+)/.exec(header)
  expect(decodeURIComponent(match![1])).toBe('Rechnung Metzgerei Müller & Söhne 2.pdf')
})
