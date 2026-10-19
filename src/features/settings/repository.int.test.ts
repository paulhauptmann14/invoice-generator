import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import type { Database, Json } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { appearanceFormValues } from './merge'
import { appearanceFormSchema, companyFormSchema, paymentFormSchema } from './schemas'

vi.mock('server-only', () => ({}))
const { loadLogoVersion, loadSettings, saveAppearance, saveCompany, saveFilenameTemplate, savePayment } = await import('./repository')
const { removeLogo, storeLogo } = await import('./logo-store')

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
// 1×1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

// The tests change the seeded Gasthaus; everything is restored exactly afterwards.
let original: { name: string; settings: { company: Json; theme: Json; filename_template: string; default_payment_days: number | null } }

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: SEED.dev, password: SEED.password })
  if (error) throw error
  const [{ data: tenant }, { data: settings }] = await Promise.all([
    supabase.from('tenants').select('name').eq('id', SEED.gasthaus).single(),
    supabase.from('settings').select('company, theme, filename_template, default_payment_days').eq('tenant_id', SEED.gasthaus).single(),
  ])
  original = { name: tenant!.name, settings: settings! }
})

afterAll(async () => {
  await removeLogo(supabase, SEED.gasthaus)
  await supabase.from('tenants').update({ name: original.name }).eq('id', SEED.gasthaus)
  const { company, theme, filename_template, default_payment_days } = original.settings
  await supabase
    .from('settings')
    .update({ company: company as NonNullable<Json>, theme: theme as NonNullable<Json>, filename_template, default_payment_days })
    .eq('tenant_id', SEED.gasthaus)
})

describe('settings repository (local Supabase)', () => {
  test('saveCompany stores the tenant name and the company fields, bank data stays', async () => {
    const before = await loadSettings(supabase, SEED.gasthaus)
    const form = companyFormSchema.parse({
      tenantName: 'Gasthaus INT',
      name: 'Gasthaus INT GmbH',
      owner: '',
      street: 'Testweg 2',
      postalCode: '54321',
      city: 'Teststadt',
      country: 'Deutschland',
      phone: '',
      email: '',
      web: '',
      taxNumber: '99/999/99999',
      vatId: '',
      commercialRegister: '',
    })
    await saveCompany(supabase, SEED.gasthaus, form)
    const after = await loadSettings(supabase, SEED.gasthaus)
    expect(after.tenantName).toBe('Gasthaus INT')
    expect(after.company).toMatchObject({ name: 'Gasthaus INT GmbH', city: 'Teststadt' })
    expect(after.company.bankAccounts).toEqual(before.company.bankAccounts)
  })

  test('savePayment stores accounts, texts and the default payment days', async () => {
    await savePayment(
      supabase,
      SEED.gasthaus,
      paymentFormSchema.parse({
        bankAccounts: [{ bankName: 'INT Bank', accountNumber: '', iban: 'DE89370400440532013000', bic: '' }],
        defaultPaymentDays: '10',
        paymentNote: 'INT bis {Faellig}',
        paymentNoteWithoutDueDate: 'INT ohne',
      }),
    )
    const after = await loadSettings(supabase, SEED.gasthaus)
    expect(after.company.bankAccounts.map((b) => b.bankName)).toEqual(['INT Bank'])
    expect(after.company.iban).toBe('')
    expect(after.defaultPaymentDays).toBe(10)
    expect(after.theme.texts.paymentNoteWithoutDueDate).toBe('INT ohne')
  })

  test('saveAppearance and saveFilenameTemplate', async () => {
    const values = appearanceFormValues((await loadSettings(supabase, SEED.gasthaus)).theme)
    await saveAppearance(supabase, SEED.gasthaus, appearanceFormSchema.parse({ ...values, layout: 'klassisch' }))
    await saveFilenameTemplate(supabase, SEED.gasthaus, 'INT_{Nr}')
    const after = await loadSettings(supabase, SEED.gasthaus)
    expect(after.theme.layout).toBe('klassisch')
    expect(after.filenameTemplate).toBe('INT_{Nr}')
  })

  test('storeLogo accepts a real PNG and replaces the previous logo', async () => {
    const first = await storeLogo(supabase, SEED.gasthaus, new Blob([PNG]))
    expect(first).toMatchObject({ ok: true })
    const second = await storeLogo(supabase, SEED.gasthaus, new Blob([PNG]))
    if (!first.ok || !second.ok) throw new Error('upload failed')
    expect(second.path).toMatch(new RegExp(`^${SEED.gasthaus}/logo-\\d+\\.png$`))
    expect((await loadSettings(supabase, SEED.gasthaus)).theme.logo.path).toBe(second.path)
    // The app shell shows the logo; its version changes with every upload (cache busting) and holds no tenant id.
    expect(await loadLogoVersion(supabase, SEED.gasthaus)).toBe(second.path.split('/')[1])
    const { data } = await supabase.storage.from('assets').list(SEED.gasthaus)
    expect(data?.filter((f) => f.name.startsWith('logo-')).map((f) => f.name)).toEqual([second.path.split('/')[1]])
  })

  test('storeLogo rejects files that are not PNG/JPEG or too large', async () => {
    expect(await storeLogo(supabase, SEED.gasthaus, new Blob(['not an image']))).toEqual({ ok: false, error: 'Bitte ein PNG- oder JPEG-Bild hochladen.' })
    expect(await storeLogo(supabase, SEED.gasthaus, new Blob([Buffer.alloc(2 * 1024 * 1024 + 1)]))).toEqual({
      ok: false,
      error: 'Das Logo darf höchstens 2 MB groß sein.',
    })
  })

  test('removeLogo deletes the file and clears the path', async () => {
    await removeLogo(supabase, SEED.gasthaus)
    expect((await loadSettings(supabase, SEED.gasthaus)).theme.logo.path).toBeNull()
    expect(await loadLogoVersion(supabase, SEED.gasthaus)).toBeNull()
    const { data } = await supabase.storage.from('assets').list(SEED.gasthaus)
    expect(data?.filter((f) => f.name.startsWith('logo-'))).toEqual([])
  })
})
