import { createClient } from '@supabase/supabase-js'
import { describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { resolveMembership } from './membership'

// Seeded local users (supabase/seed.sql); never present in the cloud project.
const PASSWORD = 'lokales-dev-passwort-123'

function client() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signedIn(email: string) {
  const supabase = client()
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return supabase
}

describe('resolveMembership (local Supabase)', () => {
  test('no session -> anonymous', async () => {
    expect(await resolveMembership(client())).toEqual({ status: 'anonymous' })
  })
  test('member -> member', async () => {
    const result = await resolveMembership(await signedIn('dev@invoice.localhost'))
    expect(result).toMatchObject({ status: 'member', email: 'dev@invoice.localhost' })
  })
  test('signed in but not on the allow-list -> forbidden', async () => {
    const result = await resolveMembership(await signedIn('stranger@invoice.localhost'))
    expect(result).toMatchObject({ status: 'forbidden', email: 'stranger@invoice.localhost' })
  })
})
