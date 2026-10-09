import { describe, expect, test } from 'vitest'
import { parseCompany } from '@/lib/domain/company'
import { defaultTheme, themeSchema } from '@/lib/domain/theme'
import { applyAppearanceForm, applyCompanyForm, applyPaymentForm, companyFormValues } from './merge'
import { appearanceFormSchema, companyFormSchema, paymentFormSchema } from './schemas'

const stored = parseCompany({
  name: 'Alt GmbH',
  street: 'Altweg 1',
  postalCode: '11111',
  city: 'Altstadt',
  taxNumber: '1',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
})

describe('applyCompanyForm', () => {
  test('replaces company fields and keeps bank data', () => {
    const form = companyFormSchema.parse({ ...companyFormValues(stored, 'Gasthaus'), name: 'Neu GmbH', city: 'Neustadt' })
    const company = applyCompanyForm(stored, form)
    expect(company).toMatchObject({ name: 'Neu GmbH', city: 'Neustadt', iban: 'DE89370400440532013000', bankName: 'Commerzbank' })
  })
  test('companyFormValues fills the form from stored data', () => {
    expect(companyFormValues(stored, 'Gasthaus')).toMatchObject({ tenantName: 'Gasthaus', name: 'Alt GmbH', street: 'Altweg 1' })
  })
})

describe('applyPaymentForm', () => {
  const form = paymentFormSchema.parse({
    bankAccounts: [{ bankName: 'Volksbank', accountNumber: '4711', iban: 'AT611904300234573201', bic: '' }],
    defaultPaymentDays: '14',
    paymentNote: 'Mit Datum {Faellig}',
    paymentNoteWithoutDueDate: 'Ohne Datum',
  })
  test('the list replaces the legacy single bank fields', () => {
    const { company } = applyPaymentForm(stored, defaultTheme, form)
    expect(company.bankAccounts).toEqual([{ bankName: 'Volksbank', accountNumber: '4711', iban: 'AT611904300234573201', bic: '' }])
    expect(company).toMatchObject({ iban: '', bic: '', bankName: '' })
  })
  test('texts go into the theme, everything else of the theme stays', () => {
    const theme = themeSchema.parse({ layout: 'klassisch', texts: { title: 'Beleg' } })
    const result = applyPaymentForm(stored, theme, form)
    expect(result.theme.texts).toMatchObject({ title: 'Beleg', paymentNote: 'Mit Datum {Faellig}', paymentNoteWithoutDueDate: 'Ohne Datum' })
    expect(result.theme.layout).toBe('klassisch')
    expect(result.defaultPaymentDays).toBe(14)
  })
})

describe('applyAppearanceForm', () => {
  test('keeps the logo path and the (unused) accent color', () => {
    const theme = themeSchema.parse({ logo: { path: 'c0000000-0000-4000-8000-000000000001/logo.png' }, colors: { accent: '#123456' } })
    const form = appearanceFormSchema.parse({
      layout: 'klassisch',
      logo: { position: 'links', widthMm: '30' },
      font: { builtin: 'Inter', baseSizePt: '10', headingSizePt: '18' },
      page: { marginTopMm: '10', marginRightMm: '20', marginBottomMm: '20', marginLeftMm: '25', din5008: 'A', senderLine: false },
      texts: { title: 'Rechnung', intro: 'Hallo', closing: '', footerColumns: ['Spalte 1'] },
      colors: { primary: '#000000', text: '#111111', tableHeaderBg: '#EEEEEE', zebra: true },
      table: {
        showPosition: false,
        showUnit: true,
        showVatRate: true,
        labels: { position: 'Nr.', description: 'Leistung', quantity: 'Menge', unit: 'Einheit', unitPrice: 'Preis', vatRate: 'USt', total: 'Summe' },
      },
    })
    const next = applyAppearanceForm(theme, form)
    expect(next.logo).toEqual({ path: 'c0000000-0000-4000-8000-000000000001/logo.png', position: 'links', widthMm: 30 })
    expect(next.colors).toEqual({ primary: '#000000', accent: '#123456', text: '#111111', tableHeaderBg: '#EEEEEE', zebra: true })
    expect(next).toMatchObject({ layout: 'klassisch', font: { builtin: 'Inter', baseSizePt: 10 }, page: { din5008: 'A', senderLine: false } })
    expect(next.texts).toMatchObject({ intro: 'Hallo', footerColumns: ['Spalte 1'], paymentNote: theme.texts.paymentNote })
    expect(next.table.labels.total).toBe('Summe')
  })
})
