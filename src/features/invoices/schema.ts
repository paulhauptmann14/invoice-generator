import { z } from 'zod'
import { customerSchema } from '@/features/customers/schema'
import { parseIsoDate } from '@/lib/domain/dates'
import { priceSchema, quantitySchema, vatRateSchema } from '@/lib/domain/input-schemas'

// Messages are shown in the invoice form (German UI).
const isoDate = (message: string) =>
  z.string().refine((v) => {
    try {
      parseIsoDate(v)
      return true
    } catch {
      return false
    }
  }, message)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((v) => (v === '' ? null : v))

export const recipientSchema = customerSchema.pick({
  name: true,
  contactPerson: true,
  street: true,
  postalCode: true,
  city: true,
  countryCode: true,
  vatId: true,
})

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Bitte eine Beschreibung eingeben.').max(1000, 'Höchstens 1000 Zeichen.'),
  quantity: quantitySchema,
  unit: z.string().trim().max(20, 'Höchstens 20 Zeichen.'),
  unitPriceGross: priceSchema,
  vatRate: vatRateSchema,
  articleId: z.uuid().nullable(),
  saveAsArticle: z.boolean(),
})

export const invoiceSchema = z
  .object({
    number: z.string().trim().min(1, 'Bitte eine Rechnungsnummer eingeben.').max(50, 'Höchstens 50 Zeichen.'),
    customerId: z.uuid().nullable(),
    saveAsCustomer: z.boolean(),
    recipient: recipientSchema,
    issueDate: isoDate('Bitte ein gültiges Rechnungsdatum wählen.'),
    serviceDateFrom: isoDate('Bitte ein gültiges Leistungsdatum wählen.'),
    serviceDateTo: isoDate('Bitte ein gültiges Enddatum wählen.').nullable(),
    paymentDays: z
      .string()
      .regex(/^\d{1,3}$/, 'Bitte 0 bis 365 Tage eingeben.')
      .transform(Number)
      .refine((n) => n <= 365, 'Bitte 0 bis 365 Tage eingeben.'),
    introText: optionalText(2000),
    closingText: optionalText(2000),
    items: z.array(invoiceItemSchema).min(1, 'Bitte mindestens eine Position hinzufügen.').max(200, 'Höchstens 200 Positionen.'),
  })
  .refine((d) => !d.serviceDateTo || d.serviceDateTo >= d.serviceDateFrom, {
    path: ['serviceDateTo'],
    message: 'Das Ende darf nicht vor dem Beginn liegen.',
  })

export type InvoiceSubmission = z.output<typeof invoiceSchema>
