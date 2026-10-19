import { bankAccountsOf, type Company, formatIban } from './company'
import { addDays, formatDateDe } from './dates'
import { formatEuro, formatQuantity, formatVatRate, toCents } from './money'
import { fillPlaceholders } from './placeholders'
import type { Theme } from './theme'
import { calcTotals, type Discount } from './totals'

export type Recipient = {
  name: string
  contactPerson: string | null
  street: string
  postalCode: string
  city: string
  countryCode: string
  vatId: string | null
}

export type InvoiceItemInput = {
  description: string
  quantity: number | string
  unit: string
  unitPriceGross: number | string
  vatRate: number | string
  discount?: Discount
}

export type InvoiceInput = {
  number: string
  issueDate: string
  serviceDateFrom: string
  serviceDateTo: string | null
  /** null = no payment terms: the invoice shows no due date. */
  paymentDays: number | null
  recipient: Recipient
  introText: string | null
  closingText: string | null
  items: InvoiceItemInput[]
  discount?: Discount
}

/** Fully formatted invoice content. Renderers (PDF, DOCX, form preview) must not calculate anything themselves. */
export type InvoiceViewModel = {
  title: string
  companyName: string
  number: string
  issueDate: string
  serviceDate: string
  dueDate: string | null
  senderLine: string
  recipientLines: string[]
  recipientVatId: string | null
  intro: string
  closing: string
  paymentNote: string
  items: {
    position: number
    description: string
    quantity: string
    unit: string
    unitPrice: string
    vatRate: string
    total: string
    /** "1 Gutschein à 60,00 €" – one-line form used by the "Briefpapier" layout. */
    line: string
    /** "abzüglich 10 % Rabatt (−49,80 €)"; null without an item discount. */
    discount: string | null
  }[]
  taxGroups: { rate: string; net: string; vat: string; gross: string }[]
  totals: {
    gross: string
    net: string
    vat: string
    /** Sum of the line totals; only set together with an invoice discount. */
    subtotal: string | null
    /** "abzüglich 5 % Rabatt" / "−30,41 €"; null without an invoice discount. */
    discount: { label: string; amount: string } | null
  }
  footerColumns: string[]
  /** "St.-Nr.: …" (or "USt-IdNr.: …"), shown next to the number in the "Briefpapier" layout. */
  taxIdLine: string
  /** Short service date statement (§ 14 UStG) for the "Briefpapier" layout. */
  serviceDateNote: string
  /** Bank accounts as label/value rows, printed below the payment note. */
  bankAccounts: { bank: string; rows: [string, string][] }[]
}

const regionNames = new Intl.DisplayNames(['de'], { type: 'region' })
const MINUS = '\u2212'
const joinLines = (lines: (string | false | null | undefined)[]) => lines.filter(Boolean).join('\n')

/**
 * Cleans user text for documents: line breaks become "\n" (CRLF, CR, and the vertical tab \x0B that Word uses as soft
 * line break), characters that are invalid in XML 1.0 (and would make a .docx unreadable) are removed.
 */
export function cleanDocumentText(text: string): string {
  return (
    text
      .replace(/\r\n?|\x0B/g, '\n')
      .replace(/[\x00-\x08\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
  )
}

/** Applies `cleanDocumentText` to every string of the view model (all user text ends up in PDF and Word). */
function cleanDeep<T>(value: T): T {
  if (typeof value === 'string') return cleanDocumentText(value) as T
  if (Array.isArray(value)) return value.map(cleanDeep) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, cleanDeep(v)])) as T
  }
  return value
}

/** "abzüglich 10 % Rabatt" (percent) or "abzüglich Rabatt" (amount). */
export function discountLabel(discount: NonNullable<Discount>): string {
  return discount.kind === 'percent' ? `abzüglich ${formatVatRate(discount.value)} Rabatt` : 'abzüglich Rabatt'
}

function recipientLines(r: Recipient): string[] {
  const lines = [r.name, r.contactPerson ? `z. Hd. ${r.contactPerson}` : '', r.street, `${r.postalCode} ${r.city}`.trim()]
  if (r.countryCode && r.countryCode.toUpperCase() !== 'DE') {
    lines.push(regionNames.of(r.countryCode.toUpperCase()) ?? r.countryCode)
  }
  return lines.filter(Boolean)
}

function autoFooter(c: Company): string[] {
  // The first account only (four columns at most); all accounts are listed below the payment note.
  const bank = bankAccountsOf(c)[0]
  return [
    joinLines([c.name, c.owner, c.street, `${c.postalCode} ${c.city}`.trim()]),
    joinLines([c.phone && `Tel. ${c.phone}`, c.email, c.web]),
    bank ? joinLines([bank.bankName, bank.iban && `IBAN ${formatIban(bank.iban)}`, bank.bic && `BIC ${bank.bic}`]) : '',
    joinLines([c.taxNumber && `St.-Nr. ${c.taxNumber}`, c.vatId && `USt-IdNr. ${c.vatId}`, c.commercialRegister]),
  ].filter(Boolean)
}

export function buildInvoiceViewModel(input: InvoiceInput, company: Company, theme: Theme): InvoiceViewModel {
  return cleanDeep(buildRawViewModel(input, company, theme))
}

function buildRawViewModel(input: InvoiceInput, company: Company, theme: Theme): InvoiceViewModel {
  const totals = calcTotals(input.items, input.discount)
  const dueIso = input.paymentDays === null ? null : addDays(input.issueDate, input.paymentDays)

  const singleServiceDay = !input.serviceDateTo || input.serviceDateTo === input.serviceDateFrom
  const serviceDateIsIssueDate = singleServiceDay && input.serviceDateFrom === input.issueDate
  const serviceDate =
    input.serviceDateTo && input.serviceDateTo !== input.serviceDateFrom
      ? `${formatDateDe(input.serviceDateFrom)} – ${formatDateDe(input.serviceDateTo)}`
      : formatDateDe(input.serviceDateFrom)

  const placeholders: Record<string, string> = {
    Nr: input.number,
    Kunde: input.recipient.name,
    Datum: formatDateDe(input.issueDate),
    Faellig: dueIso ? formatDateDe(dueIso) : '',
    Betrag: formatEuro(totals.grossCents),
    Leistungsdatum: serviceDate,
  }
  const fill = (text: string | null) => fillPlaceholders(text ?? '', placeholders)

  return {
    title: theme.texts.title,
    companyName: company.name,
    number: input.number,
    issueDate: formatDateDe(input.issueDate),
    serviceDate,
    dueDate: dueIso ? formatDateDe(dueIso) : null,
    senderLine: [company.name, company.street, `${company.postalCode} ${company.city}`.trim()].filter(Boolean).join(' · '),
    recipientLines: recipientLines(input.recipient),
    recipientVatId: input.recipient.vatId || null,
    intro: fill(input.introText),
    closing: fill(input.closingText),
    paymentNote: fill(dueIso ? theme.texts.paymentNote : theme.texts.paymentNoteWithoutDueDate),
    items: input.items.map((item, i) => ({
      position: i + 1,
      description: item.description,
      quantity: formatQuantity(item.quantity),
      unit: item.unit,
      unitPrice: formatEuro(toCents(item.unitPriceGross)),
      vatRate: formatVatRate(item.vatRate),
      total: formatEuro(totals.lineTotalsCents[i]),
      discount: item.discount ? `${discountLabel(item.discount)} (${MINUS}${formatEuro(totals.lineDiscountsCents[i])})` : null,
      line: `${[formatQuantity(item.quantity), item.unit, item.description].filter((part) => part !== '').join(' ')} à ${formatEuro(toCents(item.unitPriceGross))}`,
    })),
    taxGroups: totals.taxGroups.map((g) => ({
      rate: formatVatRate(g.rateBp / 100),
      net: formatEuro(g.netCents),
      vat: formatEuro(g.vatCents),
      gross: formatEuro(g.grossCents),
    })),
    totals: {
      gross: formatEuro(totals.grossCents),
      net: formatEuro(totals.netCents),
      vat: formatEuro(totals.vatCents),
      subtotal: input.discount ? formatEuro(totals.subtotalCents) : null,
      discount: input.discount
        ? { label: discountLabel(input.discount), amount: `${MINUS}${formatEuro(totals.invoiceDiscountCents)}` }
        : null,
    },
    footerColumns: theme.texts.footerColumns.length > 0 ? theme.texts.footerColumns.map(fill) : autoFooter(company),
    taxIdLine: company.taxNumber ? `St.-Nr.: ${company.taxNumber}` : company.vatId ? `USt-IdNr.: ${company.vatId}` : '',
    serviceDateNote: fill(serviceDateIsIssueDate ? theme.texts.serviceDateNoteSame : theme.texts.serviceDateNoteOther).trim(),
    bankAccounts: bankAccountsOf(company).map((b) => ({
      bank: b.bankName,
      rows: [
        ...(b.accountNumber ? [['Kto.-Nr.', b.accountNumber] as [string, string]] : []),
        ...(b.iban ? [['IBAN', formatIban(b.iban)] as [string, string]] : []),
        ...(b.bic ? [['BIC', b.bic] as [string, string]] : []),
      ],
    })),
  }
}
