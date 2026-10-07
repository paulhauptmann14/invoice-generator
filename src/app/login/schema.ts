import { z } from 'zod'

// Messages are shown in the login form (German UI).
export const signInSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  password: z.string().min(1, 'Bitte das Passwort eingeben.'),
})
