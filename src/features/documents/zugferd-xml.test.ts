import { describe, expect, test } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'
import { buildZugferdXml, eInvoiceProblems } from './zugferd-xml'

const company = parseCompany({
  name: 'Gasthaus & Metzgerei Beispiel',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  taxNumber: '12/345/67890',
  bankAccounts: [{ bankName: 'Sparkasse', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', accountNumber: '' }],
})
const input: InvoiceInput = {
  number: 'G1/26',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: { name: 'Müller <GmbH>', contactPerson: null, street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  introText: null,
  closingText: null,
  items: [
    { description: 'Catering', quantity: 12, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 },
    { description: 'Getränke', quantity: 3, unit: 'Fl.', unitPriceGross: 3.5, vatRate: 19 },
  ],
}
const theme = themeSchema.parse({})
const xmlFor = (i: InvoiceInput, c = company) => buildZugferdXml(i, c, buildInvoiceViewModel(i, c, theme))
/** Text of the first element with this name. */
const value = (xml: string, name: string) => new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`).exec(xml)?.[1]

describe('buildZugferdXml', () => {
  test('header: EN 16931 profile, invoice number, type and issue date', () => {
    const xml = xmlFor(input)
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rsm:CrossIndustryInvoice /)
    expect(value(xml, 'ram:ID')).toBe('urn:cen.eu:en16931:2017')
    expect(xml).toContain('<ram:ID>G1/26</ram:ID>\n    <ram:TypeCode>380</ram:TypeCode>')
    expect(xml).toContain('<udt:DateTimeString format="102">20261007</udt:DateTimeString>')
  })

  test('totals equal the printed invoice', () => {
    const vm = buildInvoiceViewModel(input, company, theme)
    const xml = buildZugferdXml(input, company, vm)
    // 298.80 + 10.50 gross
    expect(vm.totals.gross).toBe('309,30 €')
    expect(value(xml, 'ram:GrandTotalAmount')).toBe('309.30')
    expect(value(xml, 'ram:DuePayableAmount')).toBe('309.30')
    expect(value(xml, 'ram:TaxBasisTotalAmount')).toBe('288.07')
    expect(value(xml, 'ram:TaxTotalAmount')).toBe('21.23')
  })

  test('lines carry unit codes and net prices', () => {
    const xml = xmlFor(input)
    expect(xml).toContain('<ram:BilledQuantity unitCode="IE">12</ram:BilledQuantity>')
    expect(xml).toContain('<ram:BilledQuantity unitCode="XBO">3</ram:BilledQuantity>')
    expect(xml).toContain('<ram:ChargeAmount>23.271</ram:ChargeAmount>')
  })

  test('user text is escaped', () => {
    const xml = xmlFor(input)
    expect(xml).toContain('<ram:Name>Gasthaus &amp; Metzgerei Beispiel</ram:Name>')
    expect(xml).toContain('<ram:Name>Müller &lt;GmbH&gt;</ram:Name>')
  })

  test('payment: SEPA transfer to the IBAN, reference and due date', () => {
    const xml = xmlFor(input)
    expect(xml).toContain('<ram:TypeCode>58</ram:TypeCode>')
    expect(value(xml, 'ram:IBANID')).toBe('DE89370400440532013000')
    expect(value(xml, 'ram:PaymentReference')).toBe('G1/26')
    expect(xml).toMatch(/<ram:DueDateDateTime>\s*<udt:DateTimeString format="102">20261021</)
  })

  test('without payment terms: no due date, but a payment description (BR-CO-25)', () => {
    const xml = xmlFor({ ...input, paymentDays: null })
    expect(xml).not.toContain('DueDateDateTime')
    expect(value(xml, 'ram:Description')).toBeTruthy()
  })

  test('a single service day is the delivery date, a period the billing period', () => {
    expect(xmlFor(input)).toMatch(/<ram:ActualDeliverySupplyChainEvent>\s*<ram:OccurrenceDateTime>\s*<udt:DateTimeString format="102">20261007</)
    const period = xmlFor({ ...input, serviceDateFrom: '2026-10-01', serviceDateTo: '2026-10-05' })
    expect(period).toContain('<ram:ApplicableHeaderTradeDelivery/>')
    expect(period).toMatch(/<ram:StartDateTime>\s*<udt:DateTimeString format="102">20261001</)
    expect(period).toMatch(/<ram:EndDateTime>\s*<udt:DateTimeString format="102">20261005</)
  })

  test('seller identification (BR-CO-26): VAT ID, else commercial register, else tax number', () => {
    const withVatId = xmlFor(input, { ...company, vatId: 'DE123456789' })
    expect(withVatId).toContain('<ram:ID schemeID="VA">DE123456789</ram:ID>')
    expect(withVatId).not.toContain('SpecifiedLegalOrganization')

    const withRegister = xmlFor(input, { ...company, commercialRegister: 'HRB 1234, Amtsgericht Musterstadt' })
    expect(withRegister).toMatch(/<ram:SpecifiedLegalOrganization>\s*<ram:ID>HRB 1234, Amtsgericht Musterstadt</)

    expect(xmlFor(input)).toMatch(/<ram:SellerTradeParty>\s*<ram:ID>12\/345\/67890<\/ram:ID>/)
    expect(xmlFor(input)).toContain('<ram:ID schemeID="FC">12/345/67890</ram:ID>')
  })

  test('discounts: line allowance and one document allowance per rate', () => {
    const xml = xmlFor({ ...input, discount: { kind: 'percent', value: 10 }, items: [{ ...input.items[0], discount: { kind: 'amount', value: 10 } }, input.items[1]] })
    expect(xml.match(/<ram:SpecifiedTradeAllowanceCharge>/g)).toHaveLength(3)
    expect(xml).toContain('<ram:AllowanceTotalAmount>')
  })
})

describe('eInvoiceProblems', () => {
  test('complete data has no problems', () => {
    expect(eInvoiceProblems(input, company)).toEqual([])
  })

  test('an unknown country of the business and a missing recipient name are reported', () => {
    expect(eInvoiceProblems({ ...input, recipient: { ...input.recipient, name: ' ' } }, { ...company, country: 'Atlantis' })).toEqual([
      'Land der Firma („Atlantis“) nicht erkannt',
      'Name des Empfängers',
    ])
  })

  test('a CMYK JPEG logo is reported (PDF/A with an RGB output intent)', () => {
    const cmyk = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x04])
    expect(eInvoiceProblems(input, company, { data: cmyk })).toEqual(['ein Logo in RGB statt CMYK (bitte als PNG oder RGB-JPEG hochladen)'])
    expect(eInvoiceProblems(input, company, null)).toEqual([])
  })
})
