import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { getCustomer, listCustomers, hasArchivedCustomers } from './queries'

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const tag = `t${Date.now()}`
const ids: string[] = []

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: SEED.dev, password: SEED.password })
  if (error) throw error
  const { data, error: insertError } = await supabase
    .from('customers')
    .insert([
      { tenant_id: SEED.gasthaus, name: `Alpha ${tag}`, city: 'Musterstadt' },
      { tenant_id: SEED.gasthaus, name: `Beta 100% ${tag}`, city: 'Anderswo' },
      { tenant_id: SEED.gasthaus, name: `Gamma ${tag}`, city: 'Musterstadt', archived_at: new Date().toISOString() },
    ])
    .select('id')
  if (insertError) throw insertError
  ids.push(...data.map((r) => r.id))
})

afterAll(async () => {
  await supabase.from('customers').delete().in('id', ids)
})

describe('customer queries (local Supabase)', () => {
  test('search matches across fields, case-insensitive, active only', async () => {
    const rows = await listCustomers(supabase, SEED.gasthaus, { q: 'MUSTERSTADT', archived: false })
    const names = rows.map((r) => r.name)
    expect(names).toContain(`Alpha ${tag}`)
    expect(names).not.toContain(`Gamma ${tag}`)
  })
  test('archived view shows only archived customers', async () => {
    const rows = await listCustomers(supabase, SEED.gasthaus, { q: tag, archived: true })
    expect(rows.map((r) => r.name)).toEqual([`Gamma ${tag}`])
  })
  test('% is matched literally, not as a wildcard', async () => {
    const rows = await listCustomers(supabase, SEED.gasthaus, { q: `100% ${tag}`, archived: false })
    expect(rows.map((r) => r.name)).toEqual([`Beta 100% ${tag}`])
    expect(await listCustomers(supabase, SEED.gasthaus, { q: `${tag}%x`, archived: false })).toEqual([])
  })
  test('getCustomer returns the record or null', async () => {
    expect((await getCustomer(supabase, SEED.gasthaus, ids[0]))?.name).toBe(`Alpha ${tag}`)
    expect(await getCustomer(supabase, SEED.gasthaus, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
  test('hasArchivedCustomers reports archived entries', async () => {
    expect(await hasArchivedCustomers(supabase, SEED.gasthaus)).toBe(true)
  })
  test('customers of another tenant are not visible', async () => {
    expect(await listCustomers(supabase, SEED.metzgerei, { q: tag, archived: false })).toEqual([])
    expect(await getCustomer(supabase, SEED.metzgerei, ids[0])).toBeNull()
  })
})
