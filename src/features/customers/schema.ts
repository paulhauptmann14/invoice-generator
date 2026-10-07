import { z } from 'zod'

// Messages are shown next to form fields (German UI).
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .transform((v) => (v === '' ? null : v))
const text = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`)

export const CUSTOMER_FIELDS = ['name', 'contactPerson', 'street', 'postalCode', 'city', 'countryCode', 'email', 'vatId', 'notes'] as const
export type CustomerField = (typeof CUSTOMER_FIELDS)[number]

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Bitte einen Namen eingeben.').max(200, 'Höchstens 200 Zeichen.'),
  contactPerson: optionalText(200),
  street: text(200),
  postalCode: text(20),
  city: text(100),
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'Bitte ein Land auswählen.'),
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), z.email('Bitte eine gültige E-Mail-Adresse eingeben.')]))
    .transform((v) => (v === '' ? null : v)),
  vatId: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .pipe(z.union([z.literal(''), z.string().regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/, 'USt-IdNr. im Format DE123456789 eingeben.')]))
    .transform((v) => (v === '' ? null : v)),
  notes: optionalText(2000),
})

export type CustomerInput = z.output<typeof customerSchema>
