import { describe, expect, test } from 'vitest'
import { pathErrorsFrom } from '@/lib/form'
import { appearanceFormSchema, companyFormSchema, filenameFormSchema, numberRangeFormSchema, paymentFormSchema } from './schemas'

const company = {
  tenantName: 'Gasthaus',
  name: 'Gasthaus Beispiel GmbH',
  owner: '',
  street: 'Hauptstraße 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: 'Deutschland',
  phone: '',
  email: '',
  web: '',
  taxNumber: '12/345/67890',
  vatId: '',
  commercialRegister: '',
}

const errorsOf = (result: { success: boolean; error?: import('zod').ZodError }) =>
  result.success || !result.error ? {} : pathErrorsFrom(result.error)

describe('companyFormSchema', () => {
  test('accepts complete data and trims', () => {
    expect(companyFormSchema.parse({ ...company, name: '  Gasthaus Beispiel GmbH ' }).name).toBe('Gasthaus Beispiel GmbH')
  })
  test('requires the fields needed on an invoice', () => {
    const errors = errorsOf(companyFormSchema.safeParse({ ...company, tenantName: ' ', name: '', street: '', postalCode: '', city: '' }))
    expect(Object.keys(errors).sort()).toEqual(['city', 'name', 'postalCode', 'street', 'tenantName'])
  })
  test('needs a tax number or a VAT id', () => {
    expect(errorsOf(companyFormSchema.safeParse({ ...company, taxNumber: '' }))).toEqual({ taxNumber: 'Bitte Steuernummer oder USt-IdNr. angeben.' })
    expect(companyFormSchema.safeParse({ ...company, taxNumber: '', vatId: 'de123456789' }).data?.vatId).toBe('DE123456789')
  })
  test('rejects an invalid e-mail address', () => {
    expect(errorsOf(companyFormSchema.safeParse({ ...company, email: 'kein-mail' }))).toHaveProperty('email')
  })
})

describe('paymentFormSchema', () => {
  const payment = {
    bankAccounts: [{ bankName: 'Volksbank', accountNumber: '4711', iban: 'de89 3704 0044 0532 0130 00', bic: 'cobadeffxxx' }],
    defaultPaymentDays: '',
    paymentNote: 'Bitte bis {Faellig} zahlen.',
    paymentNoteWithoutDueDate: 'Bitte zahlen.',
  }
  test('normalizes IBAN and BIC, empty payment days = none', () => {
    const data = paymentFormSchema.parse(payment)
    expect(data.bankAccounts[0]).toMatchObject({ iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' })
    expect(data.defaultPaymentDays).toBeNull()
  })
  test('rejects a wrong IBAN check digit at the row', () => {
    const result = paymentFormSchema.safeParse({ ...payment, bankAccounts: [{ ...payment.bankAccounts[0], iban: 'DE89370400440532013001' }] })
    expect(errorsOf(result)).toEqual({ 'bankAccounts.0.iban': 'IBAN ist ungültig (Prüfsumme).' })
  })
  test('requires bank name and IBAN in every row', () => {
    const errors = errorsOf(paymentFormSchema.safeParse({ ...payment, bankAccounts: [{ bankName: '', accountNumber: '', iban: '', bic: '' }] }))
    expect(Object.keys(errors).sort()).toEqual(['bankAccounts.0.bankName', 'bankAccounts.0.iban'])
  })
  test('at most three bank accounts', () => {
    const errors = errorsOf(paymentFormSchema.safeParse({ ...payment, bankAccounts: Array(4).fill(payment.bankAccounts[0]) }))
    expect(errors.bankAccounts).toBe('Höchstens 3 Bankverbindungen.')
  })
  test('payment days 0 to 365', () => {
    expect(paymentFormSchema.parse({ ...payment, defaultPaymentDays: '14' }).defaultPaymentDays).toBe(14)
    expect(errorsOf(paymentFormSchema.safeParse({ ...payment, defaultPaymentDays: '400' }))).toEqual({ defaultPaymentDays: 'Bitte 0 bis 365 Tage eingeben.' })
  })
})

describe('numberRangeFormSchema', () => {
  test('accepts a valid range', () => expect(numberRangeFormSchema.parse({ name: ' Gutscheine ', format: 'GU{N}/{JJ}' })).toEqual({ name: 'Gutscheine', format: 'GU{N}/{JJ}' }))
  test('rejects a format without counter', () => {
    expect(errorsOf(numberRangeFormSchema.safeParse({ name: 'X', format: 'G/{JJ}' }))).toEqual({
      format: 'Das Format braucht genau einen Zähler-Platzhalter wie {NNNN}.',
    })
  })
  test('requires a name', () => expect(errorsOf(numberRangeFormSchema.safeParse({ name: '', format: '{N}' }))).toHaveProperty('name'))
})

describe('filenameFormSchema', () => {
  test('requires a template', () => expect(errorsOf(filenameFormSchema.safeParse({ filenameTemplate: ' ' }))).toHaveProperty('filenameTemplate'))
})

describe('appearanceFormSchema', () => {
  const appearance = {
    layout: 'briefpapier',
    logo: { position: 'rechts', widthMm: '45' },
    font: { builtin: 'IBM Plex Sans', baseSizePt: '9,5', headingSizePt: '16' },
    page: { marginTopMm: '15', marginRightMm: '20', marginBottomMm: '20', marginLeftMm: '25', din5008: 'B', senderLine: true },
    texts: { title: 'Rechnung', intro: '', closing: '', footerColumns: [] },
    colors: { primary: '#17191C', text: '#17191C', tableHeaderBg: '#ECEEE9', zebra: false },
    table: {
      showPosition: true,
      showUnit: true,
      showVatRate: true,
      labels: { position: 'Pos.', description: 'Beschreibung', quantity: 'Menge', unit: 'Einheit', unitPrice: 'Einzelpreis', vatRate: 'MwSt.', total: 'Gesamt' },
    },
  }
  test('parses decimal numbers with comma', () => {
    const data = appearanceFormSchema.parse(appearance)
    expect(data.font.baseSizePt).toBe(9.5)
    expect(data.logo.widthMm).toBe(45)
  })
  test('rejects values out of range and unimplemented layouts', () => {
    const errors = errorsOf(appearanceFormSchema.safeParse({ ...appearance, layout: 'modern', logo: { position: 'rechts', widthMm: '500' } }))
    expect(errors).toHaveProperty('layout')
    expect(errors['logo.widthMm']).toBe('Bitte einen Wert von 10 bis 120 eingeben.')
  })
  test('rejects colors that are not #RRGGBB', () => {
    expect(errorsOf(appearanceFormSchema.safeParse({ ...appearance, colors: { ...appearance.colors, primary: 'rot' } }))).toHaveProperty('colors.primary')
  })
})
