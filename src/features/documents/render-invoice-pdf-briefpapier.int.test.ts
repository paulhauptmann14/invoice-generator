import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { defaultTheme } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))
const { renderInvoicePdf } = await import('./render-invoice-pdf')

// The business's own invoice, rebuilt: a voucher (0 %) and a butcher's sale (7 %), two bank accounts.
const company = parseCompany({
  name: 'Gasthaus & Metzgerei Beispiel',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  taxNumber: '12/345/67890',
  bankAccounts: [
    { bankName: 'Volksbank Beispiel', accountNumber: '4711', iban: 'DE02120300000000202051', bic: 'BYLADEM1001' },
    { bankName: 'Sparkasse Beispiel', iban: 'DE02500105170137075030', bic: 'INGDDEFFXXX' },
  ],
})
const template = (items: InvoiceInput['items'], paymentDays: number | null = null): InvoiceInput => ({
  number: 'GU24/26',
  issueDate: '2026-10-08',
  serviceDateFrom: '2026-10-08',
  serviceDateTo: null,
  paymentDays,
  recipient: { name: 'Max Mustermann', contactPerson: null, street: 'Musterstraße 1', postalCode: '12345', city: 'Musterhausen', countryCode: 'DE', vatId: null },
  introText: '',
  closingText: '',
  items,
})
const voucherAndSale: InvoiceInput['items'] = [
  { description: 'Gutschein', quantity: 1, unit: '', unitPriceGross: 60, vatRate: 0 },
  { description: 'Verkauf Metzgerei', quantity: 1, unit: '', unitPriceGross: 9.9, vatRate: 7 },
]
// 1×1 PNG
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

async function pdfText(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: true })
  return { totalPages, text }
}

/** Asserts that all parts occur in this order. */
function expectInOrder(text: string, parts: (string | RegExp)[]) {
  let from = 0
  for (const part of parts) {
    const rest = text.slice(from)
    const match = typeof part === 'string' ? { index: rest.indexOf(part), length: part.length } : (() => {
      const m = part.exec(rest)
      return m ? { index: m.index, length: m[0].length } : { index: -1, length: 0 }
    })()
    expect(match.index, `"${part}" after position ${from}`).toBeGreaterThanOrEqual(0)
    from += match.index + match.length
  }
}

describe('renderInvoicePdf – layout "Briefpapier" (default)', () => {
  test('reads like the business template', async () => {
    const buffer = await renderInvoicePdf(buildInvoiceViewModel(template(voucherAndSale), company, defaultTheme), defaultTheme)
    const { totalPages, text } = await pdfText(buffer)
    expect(totalPages).toBe(1)
    expectInOrder(text, [
      'Gasthaus & Metzgerei Beispiel · Hauptstraße 1 · 12345 Musterstadt',
      'Max Mustermann',
      '12345 Musterhausen',
      '08.10.2026',
      'RECHNUNG',
      'GU24/26',
      'St.-Nr.: 12/345/67890',
      'Leistungsdatum entspricht Rechnungsdatum.',
      /1 Gutschein à 60,00\s€/,
      /60,00\s€/,
      /1 Verkauf Metzgerei à 9,90\s€/,
      'Gesamtbetrag brutto',
      /69,90\s€/,
      'davon 0 % USt',
      'Rechnungsbetrag netto',
      'davon 7 % USt',
      /0,65\s€/,
      'Rechnungsbetrag netto',
      /9,25\s€/,
      'Wir bitten höflich um Überweisung auf eines unserer nachfolgend genannten Konten:',
      'Volksbank Beispiel',
      'Kto.-Nr.',
      'IBAN',
      'DE02 1203 0000 0000 2020 51',
      'BIC',
      'Sparkasse Beispiel',
      'DE02 5001 0517 0137 0750 30',
    ])
    // No table header, no footer, no page number on a single page.
    for (const absent of ['Pos.', 'Einzelpreis', 'Seite 1 von 1']) expect(text).not.toContain(absent)
    expect(text.match(/St\.-Nr\./g)).toHaveLength(1)
  })

  test('payment term: due date in the payment request', async () => {
    const { text } = await pdfText(await renderInvoicePdf(buildInvoiceViewModel(template(voucherAndSale, 14), company, defaultTheme), defaultTheme))
    expect(text).toContain('Wir bitten höflich um Überweisung bis zum 22.10.2026 auf eines unserer nachfolgend genannten Konten:')
  })

  test('long invoices get page numbers', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ description: `Position ${i + 1}`, quantity: 1, unit: 'Stk.', unitPriceGross: 10, vatRate: 7 }))
    const { totalPages, text } = await pdfText(await renderInvoicePdf(buildInvoiceViewModel(template(many), company, defaultTheme), defaultTheme))
    expect(totalPages).toBeGreaterThan(1)
    expect(text).toContain(`Seite ${totalPages} von ${totalPages}`)
    expect(text).toContain('1 Stk. Position 60')
  })

  test('the logo is drawn in the head when present', async () => {
    const vm = buildInvoiceViewModel(template(voucherAndSale), company, defaultTheme)
    const without = (await renderInvoicePdf(vm, defaultTheme)).toString('latin1')
    const withLogo = (await renderInvoicePdf(vm, defaultTheme, { logo: { type: 'png', width: 1, height: 1, data: LOGO } })).toString('latin1')
    expect(without).not.toContain('/Subtype /Image')
    expect(withLogo).toContain('/Subtype /Image')
  })
})
