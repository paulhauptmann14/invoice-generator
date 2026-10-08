import { z } from 'zod'

const text = z.string().trim().max(200).default('')

export const bankAccountSchema = z.object({ bankName: text, accountNumber: text, iban: text, bic: text })
export type BankAccount = z.infer<typeof bankAccountSchema>

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
  /** Printed below the payment note (layout "Briefpapier"); the single bank fields above stay as fallback. */
  bankAccounts: z.array(bankAccountSchema).max(3).default([]),
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

/** Bank accounts to print. The single legacy fields (iban, bic, bankName) are the fallback until the settings edit the list. */
export function bankAccountsOf(c: Company): BankAccount[] {
  const list = c.bankAccounts.filter((b) => b.iban !== '' || b.accountNumber !== '')
  if (list.length > 0) return list
  return c.iban ? [{ bankName: c.bankName, accountNumber: '', iban: c.iban, bic: c.bic }] : []
}
