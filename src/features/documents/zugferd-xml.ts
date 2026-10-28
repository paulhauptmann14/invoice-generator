import { bankAccountsOf, type Company } from '@/lib/domain/company'
import { addDays } from '@/lib/domain/dates'
import { isCmykJpeg } from '@/lib/domain/image-info'
import { calcEInvoiceAmounts, countryCodeOf, type EInvoiceAmounts, unitCodeOf, type VatCategory } from '@/lib/domain/e-invoice'
import { cleanDocumentText, type InvoiceInput, type InvoiceViewModel } from '@/lib/domain/view-model'

/**
 * ZUGFeRD 2 / Factur-X invoice data: UN/CEFACT Cross Industry Invoice (CII) in the profile EN 16931 ("COMFORT"),
 * the profile that counts as an electronic invoice in Germany. Element order follows the CII schema (it is checked).
 */

/** File name of the embedded XML required by Factur-X 1.0 / ZUGFeRD 2.1 and later. */
export const ZUGFERD_FILENAME = 'factur-x.xml'
/** Profile name for the PDF metadata (fx:ConformanceLevel). */
export const ZUGFERD_CONFORMANCE_LEVEL = 'EN 16931'
const GUIDELINE_ID = 'urn:cen.eu:en16931:2017'

type Node = { name: string; attrs?: Record<string, string>; text?: string; children?: Node[] }
type Child = Node | null | undefined | false

/** Text for XML content and attributes; also drops characters XML 1.0 does not allow. */
export const escapeXml = (value: string) =>
  cleanDocumentText(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

/** Element with children (falsy children are left out) or with text (empty text leaves out the whole element). */
function el(name: string, content: string | Child[], attrs?: Record<string, string>): Node | null {
  if (typeof content === 'string') return content.trim() === '' ? null : { name, attrs, text: content }
  const children = content.filter((c): c is Node => Boolean(c))
  return children.length > 0 ? { name, attrs, children } : null
}

function serialize(node: Node, indent = ''): string {
  const attrs = Object.entries(node.attrs ?? {})
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('')
  if (node.text !== undefined) return `${indent}<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`
  if (!node.children?.length) return `${indent}<${node.name}${attrs}/>`
  const inner = (node.children ?? []).map((child) => serialize(child, `${indent}  `)).join('\n')
  return `${indent}<${node.name}${attrs}>\n${inner}\n${indent}</${node.name}>`
}

const sign = (n: number) => (n < 0 ? '-' : '')
/** Integer in 1/10^digits units -> plain decimal with at least `minDigits` decimals ("12.5" -> "12.50"). */
function decimal(value: number, digits: number, minDigits = digits): string {
  const abs = Math.abs(value)
  const unit = 10 ** digits
  const fraction = String(abs % unit)
    .padStart(digits, '0')
    .replace(/0+$/, '')
    .padEnd(minDigits, '0')
  return `${sign(value)}${Math.floor(abs / unit)}${fraction ? `.${fraction}` : ''}`
}
const amount = (cents: number) => decimal(cents, 2)
const percent = (rateBp: number) => decimal(rateBp, 2)
const date102 = (iso: string) => el('udt:DateTimeString', iso.replaceAll('-', ''), { format: '102' })

/**
 * What keeps an invoice from becoming an e-invoice beyond what a printable invoice needs; labels are user-facing
 * (German). `logo`: the logo the PDF will show, if any. Empty when complete.
 */
export function eInvoiceProblems(input: InvoiceInput, company: Company, logo: { data: Uint8Array } | null = null): string[] {
  const problems: string[] = []
  if (countryCodeOf(company.country) === null) problems.push(`Land der Firma („${company.country}“) nicht erkannt`)
  if (input.recipient.name.trim() === '') problems.push('Name des Empfängers')
  if (input.items.length === 0) problems.push('mindestens eine Position')
  if (logo && isCmykJpeg(logo.data)) problems.push('ein Logo in RGB statt CMYK (bitte als PNG oder RGB-JPEG hochladen)')
  return problems
}

const hasServicePeriod = (input: InvoiceInput) => input.serviceDateTo !== null && input.serviceDateTo !== input.serviceDateFrom

// "Not subject to VAT" carries no rate (BR-O-05, BR-O-06, BR-48).
const rateNode = (category: VatCategory, rateBp: number) => category !== 'O' && el('ram:RateApplicablePercent', percent(rateBp))

function vatNode(category: VatCategory, rateBp: number): Child[] {
  return [el('ram:TypeCode', 'VAT'), el('ram:CategoryCode', category), rateNode(category, rateBp)]
}

function allowanceNode(amountCents: number, tax?: { category: VatCategory; rateBp: number }): Node | null {
  return el('ram:SpecifiedTradeAllowanceCharge', [
    el('ram:ChargeIndicator', [el('udt:Indicator', 'false')]),
    el('ram:ActualAmount', amount(amountCents)),
    // UNTDID 5189: 95 = discount
    el('ram:ReasonCode', '95'),
    el('ram:Reason', 'Rabatt'),
    tax && el('ram:CategoryTradeTax', vatNode(tax.category, tax.rateBp)),
  ])
}

function lineNodes(input: InvoiceInput, amounts: EInvoiceAmounts): Child[] {
  return input.items.map((item, i) => {
    const line = amounts.lines[i]
    return el('ram:IncludedSupplyChainTradeLineItem', [
      el('ram:AssociatedDocumentLineDocument', [el('ram:LineID', String(i + 1))]),
      el('ram:SpecifiedTradeProduct', [el('ram:Name', item.description)]),
      el('ram:SpecifiedLineTradeAgreement', [
        el('ram:NetPriceProductTradePrice', [el('ram:ChargeAmount', decimal(line.netPriceTenThousandths, 4, 2))]),
      ]),
      el('ram:SpecifiedLineTradeDelivery', [el('ram:BilledQuantity', decimal(line.quantityMilli, 3, 0), { unitCode: unitCodeOf(item.unit) })]),
      el('ram:SpecifiedLineTradeSettlement', [
        el('ram:ApplicableTradeTax', vatNode(line.category, line.rateBp)),
        line.allowanceCents !== 0 && allowanceNode(line.allowanceCents),
        el('ram:SpecifiedTradeSettlementLineMonetarySummation', [el('ram:LineTotalAmount', amount(line.netCents))]),
      ]),
    ])
  })
}

/** `notSubjectToVat`: the VAT ID is left out (BR-O-02). */
function sellerNode(company: Company, notSubjectToVat: boolean): Node | null {
  const vatId = notSubjectToVat ? '' : company.vatId
  // BR-CO-26 asks for a seller identifier, a legal registration or a VAT ID; the tax number alone is not enough.
  // Without a VAT ID, the commercial register entry is the legal registration, or else the tax number identifies the seller.
  const withoutVatId = vatId === ''
  return el('ram:SellerTradeParty', [
    withoutVatId && company.commercialRegister === '' && el('ram:ID', company.taxNumber),
    el('ram:Name', company.name),
    withoutVatId && el('ram:SpecifiedLegalOrganization', [el('ram:ID', company.commercialRegister)]),
    el('ram:DefinedTradeContact', [
      el('ram:PersonName', company.owner),
      el('ram:TelephoneUniversalCommunication', [el('ram:CompleteNumber', company.phone)]),
      el('ram:EmailURIUniversalCommunication', [el('ram:URIID', company.email)]),
    ]),
    el('ram:PostalTradeAddress', [
      el('ram:PostcodeCode', company.postalCode),
      el('ram:LineOne', company.street),
      el('ram:CityName', company.city),
      el('ram:CountryID', countryCodeOf(company.country) ?? ''),
    ]),
    el('ram:URIUniversalCommunication', [el('ram:URIID', company.email, { schemeID: 'EM' })]),
    // FC = tax number (Steuernummer), VA = VAT identification number
    el('ram:SpecifiedTaxRegistration', [el('ram:ID', company.taxNumber, { schemeID: 'FC' })]),
    el('ram:SpecifiedTaxRegistration', [el('ram:ID', vatId, { schemeID: 'VA' })]),
  ])
}

/** `notSubjectToVat`: the VAT ID is left out (BR-O-02). */
function buyerNode(input: InvoiceInput, notSubjectToVat: boolean): Node | null {
  const r = input.recipient
  return el('ram:BuyerTradeParty', [
    el('ram:Name', r.name),
    el('ram:DefinedTradeContact', [el('ram:PersonName', r.contactPerson ?? '')]),
    el('ram:PostalTradeAddress', [
      el('ram:PostcodeCode', r.postalCode),
      el('ram:LineOne', r.street),
      el('ram:CityName', r.city),
      el('ram:CountryID', r.countryCode),
    ]),
    el('ram:SpecifiedTaxRegistration', [el('ram:ID', notSubjectToVat ? '' : (r.vatId ?? ''), { schemeID: 'VA' })]),
  ])
}

function settlementNode(input: InvoiceInput, company: Company, vm: InvoiceViewModel, amounts: EInvoiceAmounts): Node | null {
  const period = hasServicePeriod(input)
  const dueIso = input.paymentDays === null ? null : addDays(input.issueDate, input.paymentDays)
  return el('ram:ApplicableHeaderTradeSettlement', [
    el('ram:PaymentReference', input.number),
    el('ram:InvoiceCurrencyCode', 'EUR'),
    // UNTDID 4461: 58 = SEPA credit transfer; one entry per account with an IBAN.
    ...bankAccountsOf(company)
      .filter((b) => b.iban !== '')
      .map((b) =>
        el('ram:SpecifiedTradeSettlementPaymentMeans', [
          el('ram:TypeCode', '58'),
          el('ram:PayeePartyCreditorFinancialAccount', [el('ram:IBANID', b.iban.replace(/\s+/g, '').toUpperCase()), el('ram:AccountName', company.accountHolder)]),
          el('ram:PayeeSpecifiedCreditorFinancialInstitution', [el('ram:BICID', b.bic.replace(/\s+/g, '').toUpperCase())]),
        ]),
      ),
    ...amounts.taxGroups.map((g) =>
      el('ram:ApplicableTradeTax', [
        el('ram:CalculatedAmount', amount(g.taxCents)),
        el('ram:TypeCode', 'VAT'),
        // BR-O-10: "not subject to VAT" names the reason, as text and as VATEX code.
        g.category === 'O' && el('ram:ExemptionReason', 'Nicht steuerbar'),
        el('ram:BasisAmount', amount(g.basisCents)),
        el('ram:CategoryCode', g.category),
        g.category === 'O' && el('ram:ExemptionReasonCode', 'VATEX-EU-O'),
        rateNode(g.category, g.rateBp),
      ]),
    ),
    period && el('ram:BillingSpecifiedPeriod', [el('ram:StartDateTime', [date102(input.serviceDateFrom)]), el('ram:EndDateTime', [date102(input.serviceDateTo!)])]),
    ...amounts.allowances.map((a) => allowanceNode(a.amountCents, a)),
    // BR-CO-25: an amount due needs a due date or payment terms.
    el('ram:SpecifiedTradePaymentTerms', [
      el('ram:Description', vm.paymentNote || (dueIso ? '' : 'Zahlbar ohne Abzug')),
      dueIso !== null && el('ram:DueDateDateTime', [date102(dueIso)]),
    ]),
    el('ram:SpecifiedTradeSettlementHeaderMonetarySummation', [
      el('ram:LineTotalAmount', amount(amounts.lineTotalCents)),
      amounts.allowanceTotalCents !== 0 && el('ram:AllowanceTotalAmount', amount(amounts.allowanceTotalCents)),
      el('ram:TaxBasisTotalAmount', amount(amounts.taxBasisCents)),
      el('ram:TaxTotalAmount', amount(amounts.taxTotalCents), { currencyID: 'EUR' }),
      el('ram:GrandTotalAmount', amount(amounts.grandTotalCents)),
      el('ram:DuePayableAmount', amount(amounts.grandTotalCents)),
    ]),
  ])
}

/**
 * The invoice as CII XML. `vm` supplies the texts exactly as printed (placeholders filled); amounts come from
 * `calcEInvoiceAmounts`, so they match the PDF. Callers check `eInvoiceProblems` first.
 */
export function buildZugferdXml(input: InvoiceInput, company: Company, vm: InvoiceViewModel): string {
  const amounts = calcEInvoiceAmounts(input.items, input.discount)
  const period = hasServicePeriod(input)
  const root = el(
    'rsm:CrossIndustryInvoice',
    [
      el('rsm:ExchangedDocumentContext', [el('ram:GuidelineSpecifiedDocumentContextParameter', [el('ram:ID', GUIDELINE_ID)])]),
      el('rsm:ExchangedDocument', [
        el('ram:ID', input.number),
        // UNTDID 1001: 380 = commercial invoice
        el('ram:TypeCode', '380'),
        el('ram:IssueDateTime', [date102(input.issueDate)]),
        el('ram:IncludedNote', [el('ram:Content', vm.intro)]),
        el('ram:IncludedNote', [el('ram:Content', vm.closing)]),
      ]),
      el('rsm:SupplyChainTradeTransaction', [
        ...lineNodes(input, amounts),
        el('ram:ApplicableHeaderTradeAgreement', [sellerNode(company, amounts.notSubjectToVat), buyerNode(input, amounts.notSubjectToVat)]),
        // The service day is the delivery date (BT-72). A period also goes to the settlement (BG-14); a service over
        // a period is complete on its last day, which keeps the mandatory delivery element from being empty
        // (PEPPOL-EN16931-R008).
        el('ram:ApplicableHeaderTradeDelivery', [
          el('ram:ActualDeliverySupplyChainEvent', [el('ram:OccurrenceDateTime', [date102(period ? input.serviceDateTo! : input.serviceDateFrom)])]),
        ]),
        settlementNode(input, company, vm, amounts),
      ]),
    ],
    {
      'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
      'xmlns:qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
      'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
      'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
    },
  )!
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root)}\n`
}
