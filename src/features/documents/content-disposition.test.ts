import { expect, test } from 'vitest'
import { contentDisposition } from './content-disposition'

test('ASCII name', () => {
  expect(contentDisposition('attachment', 'Rechnung_A_2026-0001.pdf')).toBe(
    `attachment; filename="Rechnung_A_2026-0001.pdf"; filename*=UTF-8''Rechnung_A_2026-0001.pdf`,
  )
})
test('non-ASCII and quotes are safe', () => {
  expect(contentDisposition('inline', 'Rä"x.pdf')).toBe(`inline; filename="R__x.pdf"; filename*=UTF-8''R%C3%A4%22x.pdf`)
})
