import { describe, expect, test } from 'vitest'
import { parseCompany } from './company'
import { defaultTheme, parseTheme } from './theme'
import { buildInvoiceViewModel, type InvoiceInput } from './view-model'

const NBSP = ' '

const company = parseCompany({
  name: 'Gasthaus & Metzgerei Beispiel',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  phone: '01234 5678',
  email: 'info@beispiel.de',
  taxNumber: '12/345/67890',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
})

const input: InvoiceInput = {
  number: '2026-0001',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: {
    name: 'Müller GmbH',
    contactPerson: 'Max Muster',
    street: 'Nebenweg 5',
    postalCode: '54321',
    city: 'Beispielhausen',
    countryCode: 'DE',
    vatId: 'DE999999999',
  },
  introText: 'Rechnung {Nr} für {Kunde}',
  closingText: null,
  items: [
    { description: 'Buffet pro Person', quantity: 2, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 },
    { description: 'Apfelschorle', quantity: 3, unit: 'Fl.', unitPriceGross: 3.5, vatRate: 19 },
    { description: 'Lieferung', quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 },
  ],
}

describe('buildInvoiceViewModel', () => {
  const vm = buildInvoiceViewModel(input, company, defaultTheme)

  test('header data', () => {
    expect(vm.title).toBe('Rechnung')
    expect(vm.number).toBe('2026-0001')
    expect(vm.issueDate).toBe('07.10.2026')
    expect(vm.serviceDate).toBe('07.10.2026')
    expect(vm.dueDate).toBe('21.10.2026')
  })

  test('service period', () => {
    const range = buildInvoiceViewModel({ ...input, serviceDateFrom: '2026-10-01', serviceDateTo: '2026-10-07' }, company, defaultTheme)
    expect(range.serviceDate).toBe('01.10.2026 – 07.10.2026')
  })

  test('sender and recipient lines', () => {
    expect(vm.companyName).toBe('Gasthaus & Metzgerei Beispiel')
    expect(vm.senderLine).toBe('Gasthaus & Metzgerei Beispiel · Hauptstraße 1 · 12345 Musterstadt')
    expect(vm.recipientLines).toEqual(['Müller GmbH', 'z. Hd. Max Muster', 'Nebenweg 5', '54321 Beispielhausen'])
    expect(vm.recipientVatId).toBe('DE999999999')
  })

  test('foreign recipients get the country name', () => {
    const at = buildInvoiceViewModel(
      { ...input, recipient: { ...input.recipient, contactPerson: null, countryCode: 'AT' } },
      company,
      defaultTheme,
    )
    expect(at.recipientLines).toEqual(['Müller GmbH', 'Nebenweg 5', '54321 Beispielhausen', 'Österreich'])
  })

  test('formatted line items', () => {
    expect(vm.items[0]).toEqual({
      position: 1,
      description: 'Buffet pro Person',
      quantity: '2',
      unit: 'Pers.',
      unitPrice: `24,90${NBSP}€`,
      vatRate: '7 %',
      total: `49,80${NBSP}€`,
      line: `2 Pers. Buffet pro Person à 24,90${NBSP}€`,
    })
    expect(vm.items.map((i) => i.position)).toEqual([1, 2, 3])
  })

  test('tax groups and totals', () => {
    expect(vm.taxGroups).toEqual([
      { rate: '7 %', net: `55,89${NBSP}€`, vat: `3,91${NBSP}€`, gross: `59,80${NBSP}€` },
      { rate: '19 %', net: `8,82${NBSP}€`, vat: `1,68${NBSP}€`, gross: `10,50${NBSP}€` },
    ])
    expect(vm.totals).toEqual({ gross: `70,30${NBSP}€`, net: `64,71${NBSP}€`, vat: `5,59${NBSP}€` })
  })

  test('texts with placeholders', () => {
    expect(vm.intro).toBe('Rechnung 2026-0001 für Müller GmbH')
    expect(vm.closing).toBe('')
    expect(vm.paymentNote).toBe(
      'Wir bitten höflich um Überweisung bis zum 21.10.2026 auf eines unserer nachfolgend genannten Konten:',
    )
  })

  test('without payment days: no due date, payment note without a date', () => {
    const noDue = buildInvoiceViewModel({ ...input, paymentDays: null, introText: 'Fällig: {Faellig}.' }, company, defaultTheme)
    expect(noDue.dueDate).toBeNull()
    expect(noDue.intro).toBe('Fällig: .')
    expect(noDue.paymentNote).toBe('Wir bitten höflich um Überweisung auf eines unserer nachfolgend genannten Konten:')
  })

  test('footer generated from company data', () => {
    expect(vm.footerColumns).toEqual([
      'Gasthaus & Metzgerei Beispiel\nHauptstraße 1\n12345 Musterstadt',
      'Tel. 01234 5678\ninfo@beispiel.de',
      'Commerzbank\nIBAN DE89 3704 0044 0532 0130 00\nBIC COBADEFFXXX',
      'St.-Nr. 12/345/67890',
    ])
  })

  test('custom footer with placeholders', () => {
    const theme = parseTheme({ texts: { footerColumns: ['Rechnung {Nr}', 'Danke!'] } })
    expect(buildInvoiceViewModel(input, company, theme).footerColumns).toEqual(['Rechnung 2026-0001', 'Danke!'])
  })
})

describe('fields for the "Briefpapier" layout', () => {
  const vm = buildInvoiceViewModel(input, company, defaultTheme)

  test('tax id line prefers the tax number', () => {
    expect(vm.taxIdLine).toBe('St.-Nr.: 12/345/67890')
    expect(buildInvoiceViewModel(input, parseCompany({ vatId: 'DE123456789' }), defaultTheme).taxIdLine).toBe('USt-IdNr.: DE123456789')
    expect(buildInvoiceViewModel(input, parseCompany({}), defaultTheme).taxIdLine).toBe('')
  })

  test('service date note', () => {
    expect(vm.serviceDateNote).toBe('Leistungsdatum entspricht Rechnungsdatum.')
    const other = buildInvoiceViewModel({ ...input, serviceDateFrom: '2026-10-01' }, company, defaultTheme)
    expect(other.serviceDateNote).toBe('Leistungsdatum: 01.10.2026')
    const range = buildInvoiceViewModel({ ...input, serviceDateFrom: '2026-09-26', serviceDateTo: '2026-09-28' }, company, defaultTheme)
    expect(range.serviceDateNote).toBe('Leistungsdatum: 26.09.2026 – 28.09.2026')
    const sameDayRange = buildInvoiceViewModel({ ...input, serviceDateTo: '2026-10-07' }, company, defaultTheme)
    expect(sameDayRange.serviceDateNote).toBe('Leistungsdatum entspricht Rechnungsdatum.')
  })

  test('item line reads like the template', () => {
    expect(vm.items[0].line).toBe(`2 Pers. Buffet pro Person à 24,90${NBSP}€`)
    const noUnit = buildInvoiceViewModel(
      { ...input, items: [{ description: 'Gutschein', quantity: 1, unit: '', unitPriceGross: 60, vatRate: 0 }] },
      company,
      defaultTheme,
    )
    expect(noUnit.items[0].line).toBe(`1 Gutschein à 60,00${NBSP}€`)
  })

  test('bank accounts with labelled rows', () => {
    expect(vm.bankAccounts).toEqual([{ bank: 'Commerzbank', rows: [['IBAN', 'DE89 3704 0044 0532 0130 00'], ['BIC', 'COBADEFFXXX']] }])
    const two = parseCompany({
      bankAccounts: [
        { bankName: 'Volksbank', accountNumber: '4711', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
        { bankName: 'Sparkasse', iban: 'DE02500105170137075030', bic: '' },
      ],
    })
    const twoVm = buildInvoiceViewModel(input, two, defaultTheme)
    expect(twoVm.bankAccounts).toEqual([
      { bank: 'Volksbank', rows: [['Kto.-Nr.', '4711'], ['IBAN', 'DE02 1203 0000 0000 2020 51'], ['BIC', 'BYLADEM1001']] },
      { bank: 'Sparkasse', rows: [['IBAN', 'DE02 5001 0517 0137 0750 30']] },
    ])
  })
})
