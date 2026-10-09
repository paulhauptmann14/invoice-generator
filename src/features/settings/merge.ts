import { type Company, companySchema } from '@/lib/domain/company'
import { type Theme, themeSchema } from '@/lib/domain/theme'
import type { AppearanceForm, AppearanceFormInput, CompanyForm, CompanyFormInput, PaymentForm, PaymentFormInput } from './schemas'

// Each settings tab replaces only its own fields in the stored JSON; everything else is kept.

export function companyFormValues(company: Company, tenantName: string): CompanyFormInput {
  return {
    tenantName,
    name: company.name,
    owner: company.owner,
    street: company.street,
    postalCode: company.postalCode,
    city: company.city,
    country: company.country,
    phone: company.phone,
    email: company.email,
    web: company.web,
    taxNumber: company.taxNumber,
    vatId: company.vatId,
    commercialRegister: company.commercialRegister,
  }
}

/** The tenant name (form field tenantName) is stored in tenants.name, not in the company JSON. */
export function applyCompanyForm(company: Company, form: CompanyForm): Company {
  return companySchema.parse({
    ...company,
    name: form.name,
    owner: form.owner,
    street: form.street,
    postalCode: form.postalCode,
    city: form.city,
    country: form.country,
    phone: form.phone,
    email: form.email,
    web: form.web,
    taxNumber: form.taxNumber,
    vatId: form.vatId,
    commercialRegister: form.commercialRegister,
  })
}

export function paymentFormValues(company: Company, theme: Theme, defaultPaymentDays: number | null): PaymentFormInput {
  // Until the first save the legacy single bank fields are the only account (see bankAccountsOf).
  const accounts =
    company.bankAccounts.length > 0
      ? company.bankAccounts
      : company.iban
        ? [{ bankName: company.bankName, accountNumber: '', iban: company.iban, bic: company.bic }]
        : []
  return {
    bankAccounts: accounts.map((a) => ({ ...a })),
    defaultPaymentDays: defaultPaymentDays === null ? '' : String(defaultPaymentDays),
    paymentNote: theme.texts.paymentNote,
    paymentNoteWithoutDueDate: theme.texts.paymentNoteWithoutDueDate,
  }
}

/** The account list replaces the legacy single fields, which are cleared on the first save. */
export function applyPaymentForm(
  company: Company,
  theme: Theme,
  form: PaymentForm,
): { company: Company; theme: Theme; defaultPaymentDays: number | null } {
  return {
    company: companySchema.parse({ ...company, bankAccounts: form.bankAccounts, iban: '', bic: '', bankName: '' }),
    theme: themeSchema.parse({
      ...theme,
      texts: { ...theme.texts, paymentNote: form.paymentNote, paymentNoteWithoutDueDate: form.paymentNoteWithoutDueDate },
    }),
    defaultPaymentDays: form.defaultPaymentDays,
  }
}

const decimal = (n: number) => String(n).replace('.', ',')

export function appearanceFormValues(theme: Theme): AppearanceFormInput {
  return {
    layout: theme.layout === 'klassisch' ? 'klassisch' : 'briefpapier',
    logo: { position: theme.logo.position, widthMm: decimal(theme.logo.widthMm) },
    font: { builtin: theme.font.builtin, baseSizePt: decimal(theme.font.baseSizePt), headingSizePt: decimal(theme.font.headingSizePt) },
    page: {
      marginTopMm: decimal(theme.page.marginTopMm),
      marginRightMm: decimal(theme.page.marginRightMm),
      marginBottomMm: decimal(theme.page.marginBottomMm),
      marginLeftMm: decimal(theme.page.marginLeftMm),
      din5008: theme.page.din5008,
      senderLine: theme.page.senderLine,
    },
    texts: { title: theme.texts.title, intro: theme.texts.intro, closing: theme.texts.closing, footerColumns: [...theme.texts.footerColumns] },
    colors: { primary: theme.colors.primary, text: theme.colors.text, tableHeaderBg: theme.colors.tableHeaderBg, zebra: theme.colors.zebra },
    table: {
      showPosition: theme.table.showPosition,
      showUnit: theme.table.showUnit,
      showVatRate: theme.table.showVatRate,
      labels: { ...theme.table.labels },
    },
  }
}

/** The logo path (logo route only) and the unused accent color are kept. */
export function applyAppearanceForm(theme: Theme, form: AppearanceForm): Theme {
  return themeSchema.parse({
    ...theme,
    layout: form.layout,
    logo: { ...theme.logo, ...form.logo },
    font: { ...theme.font, ...form.font },
    page: form.page,
    texts: { ...theme.texts, ...form.texts },
    colors: { ...theme.colors, ...form.colors },
    table: form.table,
  })
}
