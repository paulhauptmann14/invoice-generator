import { bankAccountsOf, type Company, formatIban } from './company'
import { addDays, formatDateDe } from './dates'
import { formatEuro, formatQuantity, formatVatRate, toCents } from './money'
import { fillPlaceholders } from './placeholders'
import type { Theme } from './theme'
import { calcTotals } from './totals'

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
  }[]
  taxGroups: { rate: string; net: string; vat: string; gross: string }[]
  totals: { gross: string; net: string; vat: string }
  footerColumns: string[]
  /** "St.-Nr.: …" (or "USt-IdNr.: …"), shown next to the number in the "Briefpapier" layout. */
  taxIdLine: string
  /** Short service date statement (§ 14 UStG) for the "Briefpapier" layout. */
  serviceDateNote: string
  /** Bank accounts as label/value rows, printed below the payment note. */
  bankAccounts: { bank: string; rows: [string, string][] }[]
}

const regionNames = new Intl.DisplayNames(['de'], { type: 'region' })
const joinLines = (lines: (string | false | null | undefined)[]) => lines.filter(Boolean).join('\n')

function recipientLines(r: Recipient): string[] {
  const lines = [r.name, r.contactPerson ? `z. Hd. ${r.contactPerson}` : '', r.street, `${r.postalCode} ${r.city}`.trim()]
  if (r.countryCode && r.countryCode.toUpperCase() !== 'DE') {
    lines.push(regionNames.of(r.countryCode.toUpperCase()) ?? r.countryCode)
  }
  return lines.filter(Boolean)
}

function autoFooter(c: Company): string[] {
  return [
    joinLines([c.name, c.owner, c.street, `${c.postalCode} ${c.city}`.trim()]),
    joinLines([c.phone && `Tel. ${c.phone}`, c.email, c.web]),
    joinLines([c.bankName, c.iban && `IBAN ${formatIban(c.iban)}`, c.bic && `BIC ${c.bic}`]),
    joinLines([c.taxNumber && `St.-Nr. ${c.taxNumber}`, c.vatId && `USt-IdNr. ${c.vatId}`, c.commercialRegister]),
  ].filter(Boolean)
}

export function buildInvoiceViewModel(input: InvoiceInput, company: Company, theme: Theme): InvoiceViewModel {
  const totals = calcTotals(input.items)
  const dueIso = input.paymentDays === null ? null : addDays(input.issueDate, input.paymentDays)

  const placeholders: Record<string, string> = {
    Nr: input.number,
    Kunde: input.recipient.name,
    Datum: formatDateDe(input.issueDate),
    Faellig: dueIso ? formatDateDe(dueIso) : '',
    Betrag: formatEuro(totals.grossCents),
  }
  const fill = (text: string | null) => fillPlaceholders(text ?? '', placeholders)

  const singleServiceDay = !input.serviceDateTo || input.serviceDateTo === input.serviceDateFrom
  const serviceDateIsIssueDate = singleServiceDay && input.serviceDateFrom === input.issueDate
  const serviceDate =
    input.serviceDateTo && input.serviceDateTo !== input.serviceDateFrom
      ? `${formatDateDe(input.serviceDateFrom)} – ${formatDateDe(input.serviceDateTo)}`
      : formatDateDe(input.serviceDateFrom)

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
    },
    footerColumns: theme.texts.footerColumns.length > 0 ? theme.texts.footerColumns.map(fill) : autoFooter(company),
    taxIdLine: company.taxNumber ? `St.-Nr.: ${company.taxNumber}` : company.vatId ? `USt-IdNr.: ${company.vatId}` : '',
    serviceDateNote: serviceDateIsIssueDate ? 'Leistungsdatum entspricht Rechnungsdatum.' : `Leistungsdatum: ${serviceDate}`,
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
