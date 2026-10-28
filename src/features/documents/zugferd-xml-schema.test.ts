import { readdirSync, readFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'
import { describe, expect, test } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { themeSchema } from '@/lib/domain/theme'
import { buildInvoiceViewModel, type InvoiceInput } from '@/lib/domain/view-model'
import { buildZugferdXml } from './zugferd-xml'

/**
 * The official XML schema of the profile EN 16931 from the ZUGFeRD 2.5 / Factur-X 1.09 package (folder
 * `factur-x-schema`): checks element names, order and data types. The business rules (Schematron) are checked
 * by the optional Mustang test (`zugferd-mustang.int.test.ts`).
 */
const SCHEMA_DIR = new URL('./factur-x-schema/', import.meta.url)
const schemaFiles = readdirSync(SCHEMA_DIR).map((fileName) => ({ fileName, contents: readFileSync(new URL(fileName, SCHEMA_DIR), 'utf8') }))
const mainSchema = schemaFiles.find((f) => f.fileName === 'FACTUR-X_EN16931.xsd')!

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
  recipient: { name: 'Müller <GmbH>', contactPerson: 'Frau Müller', street: 'Weg 1', postalCode: '54321', city: 'Ort', countryCode: 'DE', vatId: 'DE987654321' },
  introText: 'Vielen Dank für Ihren Auftrag.\nMit freundlichen Grüßen',
  closingText: 'Bis bald!',
  items: [
    { description: 'Catering', quantity: 12, unit: 'Pers.', unitPriceGross: 24.9, vatRate: 7 },
    { description: 'Getränke', quantity: 3, unit: 'Fl.', unitPriceGross: 3.5, vatRate: 19 },
  ],
}
const complex: InvoiceInput = {
  ...simple,
  serviceDateFrom: '2026-10-01',
  serviceDateTo: '2026-10-05',
  paymentDays: null,
  recipient: { name: 'Hans Huber', contactPerson: null, street: '', postalCode: '', city: '', countryCode: 'DE', vatId: null },
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
  discount: { kind: 'amount', value: 5 },
  items: [{ description: 'Gutschein', quantity: 2, unit: 'Stk.', unitPriceGross: 50, vatRate: 0 }],
}

const cases: [string, InvoiceInput, Record<string, unknown>][] = [
  ['simple, tax number only', simple, {}],
  ['discounts, period, 0 %, credit line, VAT ID', complex, { vatId: 'DE123456789' }],
  ['commercial register, no bank account', complex, { commercialRegister: 'HRB 1234, Amtsgericht Musterstadt', bankAccounts: [] }],
  ['vouchers only (not subject to VAT)', vouchers, { vatId: 'DE123456789' }],
]

describe('ZUGFeRD XML against the official EN 16931 schema', () => {
  test.each(cases)('%s', async (_, input, companyFields) => {
    const company = parseCompany({ ...base, ...companyFields })
    const xml = buildZugferdXml(input, company, buildInvoiceViewModel(input, company, themeSchema.parse({})))
    const result = await validateXML({ xml: { fileName: 'factur-x.xml', contents: xml }, schema: mainSchema, preload: schemaFiles })
    expect(result.errors.map((e) => e.message)).toEqual([])
    expect(result.valid).toBe(true)
  })
})
