import { expect, test } from 'vitest'
import { buildFilename } from '@/lib/domain/filename'
import { filenameContextOf } from './filename-context'

const invoice = { number: 'M2/26', issue_date: '2026-10-25', recipient: { name: '  Hauptmann ' }, customer_seq: 2 }

test('takes name, number, date, range and counter from the stored invoice', () => {
  expect(filenameContextOf(invoice, 'Metzgerei')).toEqual({
    customer: 'Hauptmann',
    number: 'M2/26',
    issueDate: '2026-10-25',
    rangeName: 'Metzgerei',
    customerSeq: 2,
  })
})
test('feeds the owner pattern', () => {
  expect(buildFilename('Rechnung {Kreis} {Kunde} {Zaehler}', filenameContextOf(invoice, 'Metzgerei'), 'pdf')).toBe('Rechnung Metzgerei Hauptmann 2.pdf')
})
test('missing recipient name, range and counter', () => {
  expect(filenameContextOf({ ...invoice, recipient: null, customer_seq: undefined }, null)).toMatchObject({ customer: '', rangeName: null, customerSeq: null })
  expect(filenameContextOf({ ...invoice, recipient: { name: 5 } }, null).customer).toBe('')
})
