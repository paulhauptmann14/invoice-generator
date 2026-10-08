import { createClient } from '@supabase/supabase-js'
import { describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { resolveAccess } from './access'

function client() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signedIn(email: string) {
  const supabase = client()
  const { error } = await supabase.auth.signInWithPassword({ email, password: SEED.password })
  if (error) throw error
  return supabase
}

describe('resolveAccess (local Supabase)', () => {
  test('no session -> anonymous', async () => {
    expect(await resolveAccess(client())).toEqual({ status: 'anonymous' })
  })
  test('dev user -> both seeded tenants, sorted by name', async () => {
    const access = await resolveAccess(await signedIn(SEED.dev))
    expect(access).toMatchObject({ status: 'ok', email: SEED.dev })
    if (access.status !== 'ok') return
    const seeded = access.tenants.filter((t) => t.id === SEED.gasthaus || t.id === SEED.metzgerei)
    expect(seeded.map((t) => t.name)).toEqual(['Gasthaus Beispiel', 'Metzgerei Beispiel'])
  })
  test('user without tenant -> no-tenant', async () => {
    expect(await resolveAccess(await signedIn(SEED.stranger))).toMatchObject({ status: 'no-tenant', email: SEED.stranger })
  })
})
