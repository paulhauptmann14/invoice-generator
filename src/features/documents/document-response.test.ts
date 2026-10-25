import { expect, test } from 'vitest'
import { docxResponse, pdfResponse } from './document-response'

test('PDF responses are private and not sniffed', () => {
  const r = pdfResponse(Buffer.from('%PDF-'), { type: 'inline', filename: 'a.pdf' })
  expect(r.headers.get('Content-Type')).toBe('application/pdf')
  expect(r.headers.get('Cache-Control')).toBe('private, no-store')
  expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(r.headers.get('Content-Disposition')).toBe(`inline; filename="a.pdf"; filename*=UTF-8''a.pdf`)
})
test('PDF responses without a file name have no Content-Disposition', () => {
  expect(pdfResponse(Buffer.from('%PDF-')).headers.get('Content-Disposition')).toBeNull()
})
test('DOCX responses are always downloads with the Word media type', () => {
  const r = docxResponse(Buffer.from('PK'), 'Rechnung_Müller.docx')
  expect(r.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  expect(r.headers.get('Cache-Control')).toBe('private, no-store')
  expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(r.headers.get('Content-Disposition')).toBe(`attachment; filename="Rechnung_Mueller.docx"; filename*=UTF-8''Rechnung_M%C3%BCller.docx`)
})
test('readable names keep spaces in the UTF-8 part', () => {
  const r = pdfResponse(Buffer.from('%PDF-'), { type: 'attachment', filename: 'Rechnung Metzgerei Müller 2.pdf' })
  expect(r.headers.get('Content-Disposition')).toBe(
    `attachment; filename="Rechnung Metzgerei Mueller 2.pdf"; filename*=UTF-8''Rechnung%20Metzgerei%20M%C3%BCller%202.pdf`,
  )
})
