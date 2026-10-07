import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { getCustomer, listCustomers, hasArchivedCustomers } from './queries'

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const tag = `t${Date.now()}`
const ids: string[] = []

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: 'dev@invoice.localhost', password: 'lokales-dev-passwort-123' })
  if (error) throw error
  const { data, error: insertError } = await supabase
    .from('customers')
    .insert([
      { name: `Alpha ${tag}`, city: 'Musterstadt' },
      { name: `Beta 100% ${tag}`, city: 'Anderswo' },
      { name: `Gamma ${tag}`, city: 'Musterstadt', archived_at: new Date().toISOString() },
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
    const rows = await listCustomers(supabase, { q: 'MUSTERSTADT', archived: false })
    const names = rows.map((r) => r.name)
    expect(names).toContain(`Alpha ${tag}`)
    expect(names).not.toContain(`Gamma ${tag}`)
  })
  test('archived view shows only archived customers', async () => {
    const rows = await listCustomers(supabase, { q: tag, archived: true })
    expect(rows.map((r) => r.name)).toEqual([`Gamma ${tag}`])
  })
  test('% is matched literally, not as a wildcard', async () => {
    const rows = await listCustomers(supabase, { q: `100% ${tag}`, archived: false })
    expect(rows.map((r) => r.name)).toEqual([`Beta 100% ${tag}`])
    expect(await listCustomers(supabase, { q: `${tag}%x`, archived: false })).toEqual([])
  })
  test('getCustomer returns the record or null', async () => {
    expect((await getCustomer(supabase, ids[0]))?.name).toBe(`Alpha ${tag}`)
    expect(await getCustomer(supabase, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
  test('hasArchivedCustomers reports archived entries', async () => {
    expect(await hasArchivedCustomers(supabase)).toBe(true)
  })
})
