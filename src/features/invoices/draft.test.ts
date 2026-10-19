import { describe, expect, test } from 'vitest'
import { createDraftReducer, draftFromInvoice, draftTotals, type InvoiceDraft, newDraft, recipientNotice, toPayload } from './draft'

const RANGES = [
  { id: 'r-rechnungen', name: 'Rechnungen', format: '{JJJJ}-{NNNN}', archived: false, isDefault: true },
  { id: 'r-gutscheine', name: 'Gutscheine', format: 'GU{N}/{JJ}', archived: false, isDefault: false },
  { id: 'r-alt', name: 'Alt', format: 'A{N}', archived: true, isDefault: false },
]
const ctx = { ranges: RANGES, existing: ['2026-0007', '2027-0002', 'GU4/26'] }
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
    expect(d.items[0]).toMatchObject({ quantity: '1', vatRate: '7', articleId: null, discountKind: null, discountValue: '' })
    expect(d).toMatchObject({ discountKind: null, discountValue: '' })
  })
  test('without a default payment term the field starts empty (no due date)', () => {
    const d = newDraft({ today: '2026-10-07', numberContext: ctx, paymentDays: null, introText: '', closingText: '' })
    expect(d.paymentDays).toBe('')
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
      discountKind: null,
      discountValue: '',
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
  test('a removed item can be restored at its old position', () => {
    let d = reduce(base(), { type: 'addFreeItem', key: 'k2' })
    d = reduce(d, { type: 'addFreeItem', key: 'k3' })
    d = reduce(d, { type: 'updateItem', key: 'k2', field: 'description', value: 'Mitte' })
    const removed = d.items[1]
    d = reduce(d, { type: 'removeItem', key: 'k2' })
    d = reduce(d, { type: 'restoreItem', item: removed, index: 1 })
    expect(d.items.map((i) => i.key)).toEqual([d.items[0].key, 'k2', 'k3'])
    expect(d.items[1].description).toBe('Mitte')
  })
  test('restoring clamps the position and never duplicates an item', () => {
    const d = reduce(base(), { type: 'addFreeItem', key: 'k2' })
    const item = d.items[1]
    const removed = reduce(d, { type: 'removeItem', key: 'k2' })
    expect(reduce(removed, { type: 'restoreItem', item, index: 9 }).items.map((i) => i.key)).toEqual([d.items[0].key, 'k2'])
    expect(reduce(d, { type: 'restoreItem', item, index: 0 })).toBe(d)
  })
})

describe('number ranges', () => {
  test('a new draft uses the default range', () => {
    expect(base()).toMatchObject({ numberRangeId: 'r-rechnungen', number: '2026-0008' })
  })
  test('without ranges the number is manual', () => {
    const d = newDraft({ today: '2026-10-07', numberContext: { ranges: [], existing: [] }, paymentDays: null, introText: '', closingText: '' })
    expect(d).toMatchObject({ numberRangeId: null, number: '' })
  })
  test('switching the range suggests its next number', () => {
    expect(reduce(base(), { type: 'setNumberRange', id: 'r-gutscheine' })).toMatchObject({ numberRangeId: 'r-gutscheine', number: 'GU5/26' })
  })
  test('a number typed by hand is kept when the range changes', () => {
    const d = reduce(reduce(base(), { type: 'setField', field: 'number', value: 'SONDER-1' }), { type: 'setNumberRange', id: 'r-gutscheine' })
    expect(d).toMatchObject({ numberRangeId: 'r-gutscheine', number: 'SONDER-1' })
  })
  test('the year change uses the format of the chosen range', () => {
    let d = reduce(base(), { type: 'setNumberRange', id: 'r-gutscheine' })
    d = reduce(d, { type: 'setField', field: 'issueDate', value: '2027-01-03' })
    expect(d.number).toBe('GU1/27')
  })
  test('no range = manual number, nothing is suggested', () => {
    expect(reduce(base(), { type: 'setNumberRange', id: null })).toMatchObject({ numberRangeId: null, number: '2026-0008' })
  })
  test('the payload carries the range', () => {
    expect(toPayload(reduce(base(), { type: 'setNumberRange', id: 'r-gutscheine' })).numberRangeId).toBe('r-gutscheine')
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

describe('discounts in the draft', () => {
  // 20 x 24,90 = 498,00 at 7 %
  const withBuffet = () => {
    let d = base()
    const key = d.items[0].key
    d = reduce(d, { type: 'updateItem', key, field: 'quantity', value: '20' })
    d = reduce(d, { type: 'updateItem', key, field: 'unitPriceGross', value: '24,90' })
    return { d, key }
  }

  test('an item discount reduces the line total and is reported per line', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '10' })
    const { totals, lineTotals, lineDiscounts, invalidKeys } = draftTotals(d)
    expect(lineTotals.get(key)).toBe(44820)
    expect(lineDiscounts.get(key)).toBe(4980)
    expect(totals.grossCents).toBe(44820)
    expect(invalidKeys).toEqual([])
  })
  test('an amount discount works the same way', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'amount' })
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '48,00' })
    expect(draftTotals(d).lineTotals.get(key)).toBe(45000)
  })
  test('a line without a discount has a discount of 0', () => {
    const { d, key } = withBuffet()
    expect(draftTotals(d).lineDiscounts.get(key)).toBe(0)
  })
  test('removing the item discount (kind null) clears the value', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '10' })
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: null })
    expect(d.items[0]).toMatchObject({ discountKind: null, discountValue: '' })
    expect(draftTotals(d).lineTotals.get(key)).toBe(49800)
  })
  test('switching the kind keeps the typed value', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '10' })
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'amount' })
    expect(d.items[0]).toMatchObject({ discountKind: 'amount', discountValue: '10' })
  })
  test('an open discount without a value yet is not an error and changes nothing', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    const { lineTotals, invalidKeys } = draftTotals(d)
    expect(lineTotals.get(key)).toBe(49800)
    expect(invalidKeys).toEqual([])
  })
  test('an unparsable or out-of-range item discount marks the key invalid', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    for (const value of ['abc', '0', '100,5', '10,555']) {
      const r = draftTotals(reduce(d, { type: 'setItemDiscountValue', key, value }))
      expect(r.invalidKeys).toEqual([key])
      expect(r.totals.grossCents).toBe(49800)
      expect(r.discountMessages.has(key)).toBe(true)
    }
    const tooHigh = reduce(reduce(d, { type: 'setItemDiscountKind', key, kind: 'amount' }), { type: 'setItemDiscountValue', key, value: '498,01' })
    expect(draftTotals(tooHigh).invalidKeys).toEqual([key])
  })
  test('the item discount message is the one of the server schema and shows while typing', () => {
    const first = withBuffet()
    const key = first.key
    let d = reduce(first.d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    expect(draftTotals(d).discountMessages.size).toBe(0)
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '10,555' })
    const r = draftTotals(d)
    // too many decimals: no live deduction, exactly the server's message
    expect(r.discountMessages.get(key)).toBe('Höchstens zwei Nachkommastellen.')
    expect(r.lineDiscounts.get(key)).toBe(0)
    expect(r.totals.grossCents).toBe(49800)
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '' })
    expect(draftTotals(d).discountMessages.size).toBe(0)
    d = reduce(reduce(d, { type: 'setItemDiscountKind', key, kind: 'amount' }), { type: 'setItemDiscountValue', key, value: '498,01' })
    expect(draftTotals(d).discountMessages.get(key)).toBe('Der Rabatt ist höher als der Betrag der Position.')
  })
  test('an item discount on a line that is not positive is reported', () => {
    let d = withBuffet().d
    d = reduce(d, { type: 'addFreeItem', key: 'zero' })
    d = reduce(d, { type: 'updateItem', key: 'zero', field: 'unitPriceGross', value: '0' })
    d = reduce(d, { type: 'setItemDiscountKind', key: 'zero', kind: 'percent' })
    d = reduce(d, { type: 'setItemDiscountValue', key: 'zero', value: '10' })
    const r = draftTotals(d)
    expect(r.discountMessages.get('zero')).toBe('Ein Rabatt ist nur bei Positionen mit positivem Betrag möglich.')
    expect(r.invalidKeys).toEqual(['zero'])
  })
  test('an invoice discount changes the gross total and is split off per tax group', () => {
    let d = withBuffet().d
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'percent' })
    d = reduce(d, { type: 'setInvoiceDiscountValue', value: '5' })
    const { totals, invoiceDiscount } = draftTotals(d)
    expect(invoiceDiscount).toEqual({ kind: 'percent', value: 5 })
    expect(totals.subtotalCents).toBe(49800)
    expect(totals.invoiceDiscountCents).toBe(2490)
    expect(totals.grossCents).toBe(47310)
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: null })
    expect(d).toMatchObject({ discountKind: null, discountValue: '' })
    expect(draftTotals(d).totals.grossCents).toBe(49800)
    expect(draftTotals(d).invoiceDiscount).toBeNull()
    expect(draftTotals(d).invoiceDiscountMessage).toBeNull()
  })
  test('an unparsable or out-of-range invoice discount is ignored in the totals', () => {
    let d = withBuffet().d
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'amount' })
    for (const value of ['', 'abc', '0', '498,01', '10,555']) {
      const r = draftTotals(reduce(d, { type: 'setInvoiceDiscountValue', value }))
      expect(r.totals.grossCents).toBe(49800)
      expect(r.invoiceDiscount).toBeNull()
      // '' is "not entered yet": no message
      expect(r.invoiceDiscountMessage === null).toBe(value === '')
    }
    expect(draftTotals(reduce(d, { type: 'setInvoiceDiscountValue', value: '10,555' })).invoiceDiscountMessage).toBe('Höchstens zwei Nachkommastellen.')
    expect(draftTotals(reduce(d, { type: 'setInvoiceDiscountValue', value: '498,01' })).invoiceDiscountMessage).toBe('Der Rabatt ist höher als die Zwischensumme.')
  })
  test('a fixed invoice discount on a zero subtotal is ignored and reported, a percent discount is not', () => {
    let d = base()
    d = reduce(d, { type: 'updateItem', key: d.items[0].key, field: 'unitPriceGross', value: '0' })
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'amount' })
    d = reduce(d, { type: 'setInvoiceDiscountValue', value: '5' })
    const fixed = draftTotals(d)
    expect(fixed.invoiceDiscount).toBeNull()
    expect(fixed.invoiceDiscountMessage).toBe('Der Rabatt ist höher als die Zwischensumme.')
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'percent' })
    const percent = draftTotals(d)
    expect(percent.invoiceDiscount).toEqual({ kind: 'percent', value: 5 })
    expect(percent.invoiceDiscountMessage).toBeNull()
  })
  test('an invoice discount is ignored while a line is negative', () => {
    let d = withBuffet().d
    d = reduce(d, { type: 'addFreeItem', key: 'refund' })
    d = reduce(d, { type: 'updateItem', key: 'refund', field: 'unitPriceGross', value: '-5,00' })
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'percent' })
    d = reduce(d, { type: 'setInvoiceDiscountValue', value: '10' })
    const r = draftTotals(d)
    expect(r.totals.grossCents).toBe(49300)
    expect(r.invoiceDiscount).toBeNull()
    expect(r.invoiceDiscountMessage).toBe('Ein Rabatt auf die Rechnung ist nur möglich, wenn keine Position einen negativen Betrag hat.')
  })
  test('an invoice discount is allowed next to a 0,00 EUR line', () => {
    let d = withBuffet().d
    d = reduce(d, { type: 'addFreeItem', key: 'free' })
    d = reduce(d, { type: 'updateItem', key: 'free', field: 'unitPriceGross', value: '0' })
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'percent' })
    d = reduce(d, { type: 'setInvoiceDiscountValue', value: '10' })
    const r = draftTotals(d)
    expect(r.invoiceDiscount).toEqual({ kind: 'percent', value: 10 })
    expect(r.invoiceDiscountMessage).toBeNull()
    expect(r.totals.grossCents).toBe(44820)
  })
  test('restoring a removed item keeps its discount', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '10' })
    const removed = d.items[0]
    d = reduce(d, { type: 'addFreeItem', key: 'k2' })
    d = reduce(d, { type: 'removeItem', key })
    d = reduce(d, { type: 'restoreItem', item: removed, index: 0 })
    expect(d.items[0]).toMatchObject({ key, discountKind: 'percent', discountValue: '10' })
  })
  test('the payload carries discounts as { kind, value } or null', () => {
    const first = withBuffet()
    let d = first.d
    const key = first.key
    expect(toPayload(d)).toMatchObject({ discount: null })
    expect(toPayload(d).items[0]).toMatchObject({ discount: null })
    d = reduce(d, { type: 'setItemDiscountKind', key, kind: 'percent' })
    d = reduce(d, { type: 'setItemDiscountValue', key, value: '10' })
    d = reduce(d, { type: 'setInvoiceDiscountKind', kind: 'amount' })
    d = reduce(d, { type: 'setInvoiceDiscountValue', value: '30,41' })
    const p = toPayload(d)
    expect(p.items[0].discount).toEqual({ kind: 'percent', value: '10' })
    expect(p.discount).toEqual({ kind: 'amount', value: '30,41' })
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

describe('draftFromInvoice', () => {
  const stored = {
    number: '2026-0001',
    number_range_id: 'r-gutscheine',
    customer_id: null,
    recipient: { name: 'Bar' },
    issue_date: '2026-10-07',
    service_date_from: '2026-10-07',
    service_date_to: null,
    payment_days: null,
    intro_text: null,
    closing_text: null,
    discount_kind: null,
    discount_value: null,
    invoice_items: [],
  }
  test('an invoice without payment terms gets an empty field', () => {
    expect(draftFromInvoice(stored).paymentDays).toBe('')
  })
  test('stored payment days are shown as text', () => {
    expect(draftFromInvoice({ ...stored, payment_days: 30 }).paymentDays).toBe('30')
  })
  test('keeps the stored number range', () => {
    expect(draftFromInvoice(stored).numberRangeId).toBe('r-gutscheine')
  })
  test('reads item and invoice discounts back as input text', () => {
    const item = { id: 'i1', position: 0, description: 'A', quantity: 1, unit: '', unit_price_gross: 10, vat_rate: 7, article_id: null }
    const d = draftFromInvoice({
      ...stored,
      discount_kind: 'amount',
      discount_value: 30.41,
      invoice_items: [
        { ...item, discount_kind: 'percent', discount_value: 12.5 },
        { ...item, id: 'i2', position: 1, discount_kind: null, discount_value: null },
      ],
    })
    expect(d).toMatchObject({ discountKind: 'amount', discountValue: '30,41' })
    expect(d.items[0]).toMatchObject({ discountKind: 'percent', discountValue: '12,5' })
    expect(d.items[1]).toMatchObject({ discountKind: null, discountValue: '' })
  })
  test('percent reads back without trailing zeros, amounts keep two places', () => {
    const item = { id: 'i1', position: 0, description: 'A', quantity: 1, unit: '', unit_price_gross: 100, vat_rate: 7, article_id: null }
    const d = draftFromInvoice({
      ...stored,
      discount_kind: 'percent',
      discount_value: 10,
      invoice_items: [{ ...item, discount_kind: 'amount', discount_value: 50 }],
    })
    expect(d).toMatchObject({ discountKind: 'percent', discountValue: '10' })
    expect(d.items[0]).toMatchObject({ discountKind: 'amount', discountValue: '50,00' })
  })
  test('an invoice without discount columns gets none', () => {
    expect(draftFromInvoice(stored)).toMatchObject({ discountKind: null, discountValue: '' })
  })
})
