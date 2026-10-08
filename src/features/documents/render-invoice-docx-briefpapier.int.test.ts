import JSZip from 'jszip'
import { describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { defaultTheme } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))
const { renderInvoiceDocx } = await import('./render-invoice-docx')

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
const input: InvoiceInput = {
  number: 'GU24/26',
  issueDate: '2026-10-08',
  serviceDateFrom: '2026-10-08',
  serviceDateTo: null,
  paymentDays: null,
  recipient: { name: 'Max Mustermann', contactPerson: null, street: 'Musterstraße 1', postalCode: '12345', city: 'Musterhausen', countryCode: 'DE', vatId: null },
  introText: '',
  closingText: '',
  items: [
    { description: 'Gutschein', quantity: 1, unit: '', unitPriceGross: 60, vatRate: 0 },
    { description: 'Verkauf Metzgerei', quantity: 1, unit: '', unitPriceGross: 9.9, vatRate: 7 },
  ],
}
// 1×1 PNG
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const textOf = (xml: string) => decode([...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' '))

async function parts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files)
  const read = (name: string) => zip.file(name)!.async('string')
  const headers = (await Promise.all(names.filter((n) => /^word\/header\d*\.xml$/.test(n)).map(read))).join('')
  const footers = (await Promise.all(names.filter((n) => /^word\/footer\d*\.xml$/.test(n)).map(read))).join('')
  const doc = await read('word/document.xml')
  return { names, doc, docText: textOf(doc), headers, footerText: textOf(footers) }
}

function expectInOrder(text: string, parts: (string | RegExp)[]) {
  let from = 0
  for (const part of parts) {
    const rest = text.slice(from)
    const m = typeof part === 'string' ? { index: rest.indexOf(part), length: part.length } : (() => {
      const r = part.exec(rest)
      return r ? { index: r.index, length: r[0].length } : { index: -1, length: 0 }
    })()
    expect(m.index, `"${part}" after position ${from}`).toBeGreaterThanOrEqual(0)
    from += m.index + m.length
  }
}

describe('renderInvoiceDocx – layout "Briefpapier" (default)', () => {
  test('reads like the business template, no table header, no footer, no page numbers', async () => {
    const { doc, docText, footerText } = await parts(await renderInvoiceDocx(buildInvoiceViewModel(input, company, defaultTheme), defaultTheme))
    expectInOrder(docText, [
      'Gasthaus & Metzgerei Beispiel · Hauptstraße 1 · 12345 Musterstadt',
      'Max Mustermann',
      '12345 Musterhausen',
      '08.10.2026',
      'Rechnung',
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
      'Wir bitten höflich um Überweisung auf eines unserer nachfolgend genannten Konten:',
      'Volksbank Beispiel',
      'Kto.-Nr.',
      'DE02 1203 0000 0000 2020 51',
      'Sparkasse Beispiel',
      'DE02 5001 0517 0137 0750 30',
    ])
    // "RECHNUNG" in capitals like the template (Word all-caps formatting).
    expect(doc).toContain('<w:caps/>')
    for (const absent of ['Pos.', 'Einzelpreis']) expect(docText).not.toContain(absent)
    expect(footerText).toBe('')
    expect(doc).not.toMatch(/NUMPAGES/)
  })

  test('the logo sits in the header when present', async () => {
    const vm = buildInvoiceViewModel(input, company, defaultTheme)
    const without = await parts(await renderInvoiceDocx(vm, defaultTheme))
    expect(without.names.some((n) => n.startsWith('word/media/'))).toBe(false)
    const withLogo = await parts(await renderInvoiceDocx(vm, defaultTheme, { logo: { type: 'png', width: 1, height: 1, data: LOGO } }))
    expect(withLogo.names.some((n) => n.startsWith('word/media/'))).toBe(true)
    expect(withLogo.headers).toContain('r:embed')
  })
})
