import { z } from 'zod'
import { parseGermanDecimal } from '@/lib/domain/decimal'
import { isValidIban, normalizeIban } from '@/lib/domain/iban'
import { validateNumberFormat } from '@/lib/domain/invoice-number'
import { BUILTIN_FONTS } from '@/lib/domain/theme'

// Form schemas of the settings tabs. Messages are shown next to the fields (German UI).
// The forms send structured JSON (like the invoice form), so nested paths ("bankAccounts.0.iban") carry the errors.

const text = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`)
const required = (max: number, message: string) => text(max).min(1, message)

/** German decimal string within [min, max] -> number. */
const rangeNumber = (min: number, max: number) =>
  z.string().transform((value, ctx) => {
    const n = parseGermanDecimal(value)
    if (n === null || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: `Bitte einen Wert von ${min} bis ${max} eingeben.` })
      return z.NEVER
    }
    return n
  })

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #RRGGBB angeben.')

export const companyFormSchema = z
  .object({
    tenantName: required(120, 'Bitte einen Namen für den Betrieb eingeben.'),
    name: required(200, 'Bitte den Firmennamen eingeben.'),
    owner: text(200),
    street: required(200, 'Bitte Straße und Hausnummer eingeben.'),
    postalCode: required(20, 'Bitte die PLZ eingeben.'),
    city: required(100, 'Bitte den Ort eingeben.'),
    country: text(100),
    phone: text(50),
    email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(''), z.email('Bitte eine gültige E-Mail-Adresse eingeben.')])),
    web: text(200),
    taxNumber: text(50),
    vatId: z
      .string()
      .transform((v) => v.replace(/\s+/g, '').toUpperCase())
      .pipe(z.union([z.literal(''), z.string().regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/, 'USt-IdNr. im Format DE123456789 eingeben.')])),
    commercialRegister: text(200),
  })
  .refine((c) => c.taxNumber !== '' || c.vatId !== '', { path: ['taxNumber'], message: 'Bitte Steuernummer oder USt-IdNr. angeben.' })

export type CompanyFormInput = z.input<typeof companyFormSchema>
export type CompanyForm = z.output<typeof companyFormSchema>

const bankAccountRow = z.object({
  bankName: required(200, 'Bitte den Namen der Bank eingeben.'),
  accountNumber: text(30),
  iban: z
    .string()
    .transform(normalizeIban)
    .pipe(z.string().min(1, 'Bitte eine IBAN eingeben.').refine(isValidIban, 'IBAN ist ungültig (Prüfsumme).')),
  bic: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .pipe(z.union([z.literal(''), z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'BIC mit 8 oder 11 Zeichen eingeben.')])),
})

export const paymentFormSchema = z.object({
  bankAccounts: z.array(bankAccountRow).max(3, 'Höchstens 3 Bankverbindungen.'),
  // Empty = new invoices start without payment terms (no due date).
  defaultPaymentDays: z
    .string()
    .trim()
    .regex(/^(\d{1,3})?$/, 'Bitte 0 bis 365 Tage eingeben.')
    .transform((v) => (v === '' ? null : Number(v)))
    .refine((n) => n === null || n <= 365, 'Bitte 0 bis 365 Tage eingeben.'),
  paymentNote: text(1000),
  paymentNoteWithoutDueDate: text(1000),
})

export type PaymentFormInput = z.input<typeof paymentFormSchema>
export type PaymentForm = z.output<typeof paymentFormSchema>

export const numberRangeFormSchema = z.object({
  name: required(60, 'Bitte einen Namen eingeben.'),
  format: z
    .string()
    .trim()
    .max(50, 'Höchstens 50 Zeichen.')
    .superRefine((format, ctx) => {
      const message = validateNumberFormat(format)
      if (message) ctx.addIssue({ code: 'custom', message })
    }),
})

export type NumberRangeForm = z.output<typeof numberRangeFormSchema>

export const filenameFormSchema = z.object({
  filenameTemplate: required(200, 'Bitte ein Muster für den Dateinamen eingeben.'),
})

const label = text(30)

export const appearanceFormSchema = z.object({
  // Only layouts with a PDF + Word implementation can be chosen.
  layout: z.enum(['briefpapier', 'klassisch'], 'Bitte ein Layout wählen.'),
  logo: z.object({
    position: z.enum(['links', 'mitte', 'rechts'], 'Bitte eine Position wählen.'),
    widthMm: rangeNumber(10, 120),
  }),
  font: z.object({
    builtin: z.enum(BUILTIN_FONTS, 'Bitte eine Schrift wählen.'),
    baseSizePt: rangeNumber(7, 14),
    headingSizePt: rangeNumber(10, 28),
  }),
  page: z.object({
    marginTopMm: rangeNumber(5, 50),
    marginRightMm: rangeNumber(5, 50),
    marginBottomMm: rangeNumber(5, 50),
    marginLeftMm: rangeNumber(5, 50),
    din5008: z.enum(['A', 'B'], 'Bitte Form A oder B wählen.'),
    senderLine: z.boolean(),
  }),
  texts: z.object({
    title: required(40, 'Bitte einen Titel eingeben.'),
    intro: text(2000),
    closing: text(2000),
    footerColumns: z.array(text(500)).max(4, 'Höchstens 4 Spalten.'),
  }),
  colors: z.object({ primary: hex, text: hex, tableHeaderBg: hex, zebra: z.boolean() }),
  table: z.object({
    showPosition: z.boolean(),
    showUnit: z.boolean(),
    showVatRate: z.boolean(),
    labels: z.object({
      position: label,
      description: label,
      quantity: label,
      unit: label,
      unitPrice: label,
      vatRate: label,
      total: label,
    }),
  }),
})

export type AppearanceFormInput = z.input<typeof appearanceFormSchema>
export type AppearanceForm = z.output<typeof appearanceFormSchema>
