import { describe, expect, test } from 'vitest'
import { createDraftReducer, draftTotals, type InvoiceDraft, newDraft, recipientNotice, toPayload } from './draft'

const ctx = { format: '{JJJJ}-{NNNN}', existing: ['2026-0007', '2027-0002'] }
const reduce = createDraftReducer(ctx)
const base = (): InvoiceDraft =>
  newDraft({ today: '2026-10-07', numberContext: ctx, paymentDays: 14, introText: 'Hallo {Kunde}', closingText: 'Danke' })

describe('newDraft', () => {
  test('suggests the next number and prefills dates, texts and one free item', () => {
    const d = base()
    expect(d).toMatchObject({
      number: '2026-0008',
      numberEdited: false,
      issueDate: '2026-10-07',
      serviceDateFrom: '2026-10-07',
      serviceDateTo: null,
      paymentDays: '14',
      introText: 'Hallo {Kunde}',
      closingText: 'Danke',
      recipient: { countryCode: 'DE', name: '' },
    })
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ quantity: '1', vatRate: '7', articleId: null })
  })
})

describe('draftReducer', () => {
  test('changing the issue year re-suggests the number until it was edited by hand', () => {
    let d = reduce(base(), { type: 'setField', field: 'issueDate', value: '2027-01-03' })
    expect(d.number).toBe('2027-0003')
    d = reduce(d, { type: 'setField', field: 'number', value: 'RE-SONDER' })
    d = reduce(d, { type: 'setField', field: 'issueDate', value: '2026-12-30' })
    expect(d).toMatchObject({ number: 'RE-SONDER', numberEdited: true })
  })
  test('selecting a customer copies the address and clears "save as customer"', () => {
    let d = reduce(base(), { type: 'setSaveAsCustomer', value: true })
    d = reduce(d, {
      type: 'selectCustomer',
      customer: { id: 'c1', name: 'Müller', contactPerson: null, street: 'Weg 1', postalCode: '1', city: 'Ort', countryCode: 'AT', vatId: 'ATU1' },
    })
    expect(d).toMatchObject({ customerId: 'c1', saveAsCustomer: false, recipient: { name: 'Müller', contactPerson: '', countryCode: 'AT', vatId: 'ATU1' } })
    d = reduce(d, { type: 'clearCustomer' })
    expect(d).toMatchObject({ customerId: null, recipient: { name: '', countryCode: 'DE' } })
  })
  test('adding an article copies its values; description gets a second line', () => {
    const d = reduce(base(), {
      type: 'addArticle',
      key: 'k2',
      article: { id: 'a1', name: 'Rinderfilet', description: 'vom Weiderind', unit: 'kg', unitPriceGross: 54.9, vatRate: 7 },
    })
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toEqual({
      key: 'k2',
      description: 'Rinderfilet\nvom Weiderind',
      quantity: '1',
      unit: 'kg',
      unitPriceGross: '54,90',
      vatRate: '7',
      articleId: 'a1',
      saveAsArticle: false,
    })
  })
  test('adding an article replaces an untouched empty line, but keeps lines with input', () => {
    const article = { id: 'a1', name: 'Buffet', description: null, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 }
    const replaced = reduce(base(), { type: 'addArticle', key: 'k2', article })
    expect(replaced.items.map((i) => i.key)).toEqual(['k2'])
    let kept = reduce(base(), { type: 'updateItem', key: base().items[0].key, field: 'description', value: 'Eigene Zeile' })
    kept = reduce(kept, { type: 'addArticle', key: 'k3', article })
    expect(kept.items).toHaveLength(2)
  })
  test('items can be edited, moved and removed', () => {
    let d = reduce(base(), { type: 'addFreeItem', key: 'k2' })
    const [first] = d.items
    d = reduce(d, { type: 'updateItem', key: 'k2', field: 'description', value: 'Zweite' })
    d = reduce(d, { type: 'moveItem', key: 'k2', direction: -1 })
    expect(d.items.map((i) => i.key)).toEqual(['k2', first.key])
    d = reduce(d, { type: 'moveItem', key: 'k2', direction: -1 })
    expect(d.items[0].key).toBe('k2')
    d = reduce(d, { type: 'removeItem', key: 'k2' })
    expect(d.items.map((i) => i.key)).toEqual([first.key])
  })
})

describe('draftTotals', () => {
  test('uses German decimals and skips invalid lines', () => {
    let d = base()
    const key = d.items[0].key
    d = reduce(d, { type: 'updateItem', key, field: 'quantity', value: '2' })
    d = reduce(d, { type: 'updateItem', key, field: 'unitPriceGross', value: '24,90' })
    d = reduce(d, { type: 'addFreeItem', key: 'bad' })
    d = reduce(d, { type: 'updateItem', key: 'bad', field: 'unitPriceGross', value: 'abc' })
    const { totals, invalidKeys, lineTotals } = draftTotals(d)
    expect(totals.grossCents).toBe(4980)
    expect(lineTotals.get(key)).toBe(4980)
    expect(invalidKeys).toEqual(['bad'])
  })
})

describe('recipientNotice', () => {
  test('missing address: warning above 250 EUR, info otherwise, nothing when complete', () => {
    const d = base()
    expect(recipientNotice(d, 25001)?.level).toBe('warning')
    expect(recipientNotice(d, 25000)?.level).toBe('info')
    const complete = { ...d, recipient: { ...d.recipient, name: 'A', street: 'S', postalCode: '1', city: 'O' } }
    expect(recipientNotice(complete, 99999)).toBeNull()
  })
})

describe('toPayload', () => {
  test('drops client-only fields', () => {
    const p = toPayload(base())
    expect(p).not.toHaveProperty('numberEdited')
    expect(p.items[0]).not.toHaveProperty('key')
  })
})
