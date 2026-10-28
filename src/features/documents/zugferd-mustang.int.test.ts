import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test, vi } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'

vi.mock('server-only', () => ({}))

const { renderZugferdInvoicePdf } = await import('./zugferd-pdf')

/**
 * Full check of ZUGFeRD invoices with the Mustang validator (https://github.com/ZUGFeRD/mustangproject): PDF/A-3
 * (veraPDF) and the XML against the official schema and business rules (Schematron) of EN 16931. Optional, as it
 * needs Java and the Mustang CLI jar: `MUSTANG_JAR=/path/to/Mustang-CLI-2.26.0.jar npm run test:integration`.
 */
const jar = process.env.MUSTANG_JAR

const base = {
  name: 'Gasthaus & Metzgerei Beispiel',
  owner: 'Max Mustermann',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  phone: '01234 5678',
  email: 'info@gasthaus.example',
  taxNumber: '12/345/67890',
  bankAccounts: [{ bankName: 'Sparkasse', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', accountNumber: '' }],
}
const simple: InvoiceInput = {
  number: 'G1/26',
  issueDate: '2026-10-07',
  serviceDateFrom: '2026-10-07',
  serviceDateTo: null,
  paymentDays: 14,
  recipient: { name: 'Müller GmbH', contactPerson: 'Frau Müller', street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: 'DE987654321' },
  introText: 'Vielen Dank für Ihren Auftrag.\nMit freundlichen Grüßen',
  closingText: null,
  items: [
    { description: 'Catering', quantity: 12, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 },
    { description: 'Getränke', quantity: 3, unit: 'Fl.', unitPriceGross: 3.5, vatRate: 19 },
  ],
}
const complex: InvoiceInput = {
  ...simple,
  number: 'G2/26',
  serviceDateFrom: '2026-10-01',
  serviceDateTo: '2026-10-05',
  paymentDays: null,
  recipient: { name: 'Hans Huber', contactPerson: null, street: 'Dorfstraße 2', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: null },
  items: [
    { description: 'Menü', quantity: 7, unit: 'Portion', unitPriceGross: 18.9, vatRate: 7, discount: { kind: 'percent', value: 10 } },
    { description: 'Wein', quantity: 1.5, unit: 'l', unitPriceGross: 21.99, vatRate: 19, discount: { kind: 'amount', value: 3 } },
    { description: 'Pfandflaschen', quantity: 1, unit: 'Stk.', unitPriceGross: 5, vatRate: 0 },
    { description: 'Anzahlung', quantity: 1, unit: 'Pauschale', unitPriceGross: -20, vatRate: 19 },
    { description: 'Raummiete', quantity: 3.25, unit: 'Std.', unitPriceGross: 33.33, vatRate: 19 },
  ],
  discount: { kind: 'percent', value: 5 },
}
const vouchers: InvoiceInput = {
  ...simple,
  number: 'GU1/26',
  discount: { kind: 'amount', value: 5 },
  items: [{ description: 'Gutschein', quantity: 2, unit: 'Stk.', unitPriceGross: 50, vatRate: 0 }],
}

const cases: [string, InvoiceInput, Record<string, unknown>, string][] = [
  ['briefpapier', simple, {}, 'briefpapier'],
  ['klassisch', complex, { vatId: 'DE123456789' }, 'klassisch'],
  ['kompakt', complex, { commercialRegister: 'HRB 1234, Amtsgericht Musterstadt', bankAccounts: [] }, 'kompakt'],
  ['modern, vouchers', vouchers, { vatId: 'DE123456789' }, 'modern'],
]

describe.skipIf(!jar)('ZUGFeRD invoices pass the Mustang validator', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zugferd-mustang-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test.each(cases)('%s', async (name, input, companyFields, layout) => {
    const company = parseCompany({ ...base, ...companyFields })
    const theme = themeSchema.parse({ layout })
    const pdf = await renderZugferdInvoicePdf({ vm: buildInvoiceViewModel(input, company, theme), theme, logo: null, input, company })
    const file = join(dir, `${name}.pdf`)
    writeFileSync(file, pdf)

    const report = execFileSync('java', ['-jar', jar!, '--action', 'validate', '--source', file, '--no-notices'], {
      cwd: dir,
      encoding: 'utf8',
      // The report goes to stdout; Java and Mustang log to stderr.
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const messages = [...report.matchAll(/<(error|warning)[^>]*type="(\d+)"[^>]*>([^<]*)/g)].map(([, kind, type, text]) => ({ kind, type, text }))
    // Type 10 is Mustang's own recalculation of the VAT from the net amounts. The app derives the VAT from gross
    // prices, which can differ by a cent; the official rule (BR-S-09) allows that.
    expect(messages.filter((m) => !(m.kind === 'warning' && m.type === '10'))).toEqual([])
    expect([...report.matchAll(/<summary status="(\w+)"\/>/g)].map((m) => m[1])).toEqual(['valid', 'valid', 'valid'])
  }, 60_000)
})
