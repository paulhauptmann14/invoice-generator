import { z } from 'zod'

// Messages are shown in the forms (German UI).

export const resetRequestSchema = z.object({
  email: z.string().trim().pipe(z.email('Bitte eine gültige E-Mail-Adresse eingeben.')),
})

// Supabase enforces the same minimum (config: minimum_password_length = 12).
export const MIN_PASSWORD_LENGTH = 12

export const newPasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`).max(200, 'Höchstens 200 Zeichen.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Die Passwörter stimmen nicht überein.' })

export const registerSchema = z
  .object({
    email: resetRequestSchema.shape.email,
    password: newPasswordSchema.shape.password,
    confirm: newPasswordSchema.shape.confirm,
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Die Passwörter stimmen nicht überein.' })

export type Notice = { kind: 'error' | 'info'; text: string }

const NOTICES: Record<string, Notice> = {
  'link-ungueltig': { kind: 'error', text: 'Der Link ist abgelaufen oder ungültig. Bitte erneut anfordern.' },
}

/** Notice for the login page from ?hinweis=…; unknown values show nothing (never echoed). */
export function loginNotice(value: string | string[] | undefined): Notice | null {
  return typeof value === 'string' && Object.hasOwn(NOTICES, value) ? NOTICES[value] : null
}
