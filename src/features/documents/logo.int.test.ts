import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { themeSchema } from '@/lib/domain/theme'
import { SEED } from '@/test-support/seed-ids'
import type { Database } from '@/lib/supabase/database.types'

vi.mock('server-only', () => ({}))
const { loadLogo } = await import('./logo')

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
// 1×1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
// Logos live below the tenant's own folder.
const dir = `${SEED.gasthaus}/PGTAP-LOGO-${Date.now()}`
const withPath = (path: string | null) => themeSchema.parse({ logo: { path } })

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: SEED.dev, password: SEED.password })
  if (error) throw error
  const bucket = supabase.storage.from('assets')
  for (const [name, body] of [['logo.png', PNG], ['fake.png', Buffer.from('not an image')]] as const) {
    const { error: uploadError } = await bucket.upload(`${dir}/${name}`, body, { contentType: 'image/png' })
    if (uploadError) throw uploadError
  }
})

afterAll(async () => {
  await supabase.storage.from('assets').remove([`${dir}/logo.png`, `${dir}/fake.png`])
})

describe('loadLogo (local Supabase)', () => {
  test('no logo configured -> null', async () => {
    expect(await loadLogo(supabase, SEED.gasthaus, withPath(null))).toBeNull()
  })
  test('a real PNG is loaded with its size', async () => {
    const logo = await loadLogo(supabase, SEED.gasthaus, withPath(`${dir}/logo.png`))
    expect(logo).toMatchObject({ type: 'png', width: 1, height: 1 })
    expect(logo?.data.equals(PNG)).toBe(true)
  })
  test('missing file or fake image -> null (the document is rendered without logo)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadLogo(supabase, SEED.gasthaus, withPath(`${dir}/missing.png`))).toBeNull()
    expect(await loadLogo(supabase, SEED.gasthaus, withPath(`${dir}/fake.png`))).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  test('a path outside the tenant folder is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadLogo(supabase, SEED.metzgerei, withPath(`${dir}/logo.png`))).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
