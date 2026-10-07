import { z } from 'zod'

const text = z.string().trim().max(200).default('')

export const companySchema = z.object({
  name: text,
  owner: text,
  street: text,
  postalCode: text,
  city: text,
  country: text.default('Deutschland'),
  phone: text,
  email: text,
  web: text,
  taxNumber: text,
  vatId: text,
  accountHolder: text,
  iban: text,
  bic: text,
  bankName: text,
  commercialRegister: text,
})

export type Company = z.infer<typeof companySchema>

export function parseCompany(raw: unknown): Company {
  const result = companySchema.safeParse(raw ?? {})
  return result.success ? result.data : companySchema.parse({})
}

/** Fields required on a German invoice (§ 14 UStG) that are still empty. Labels are user-facing (German). */
export function missingCompanyFields(c: Company): string[] {
  const missing: string[] = []
  if (!c.name) missing.push('Firmenname')
  if (!c.street) missing.push('Straße')
  if (!c.postalCode) missing.push('PLZ')
  if (!c.city) missing.push('Ort')
  if (!c.taxNumber && !c.vatId) missing.push('Steuernummer oder USt-IdNr.')
  return missing
}

export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')
}
