import { z } from 'zod'

/** Name of a business as shown in the switcher (not the company name on invoices). */
export const tenantNameSchema = z.string().trim().min(1, 'Bitte einen Namen eingeben.').max(120, 'Höchstens 120 Zeichen.')
