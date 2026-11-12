import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { numberDrafts } from './numbering'

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
// A range of its own, so the numbers do not depend on other invoices.
const prefix = `ND${Date.now() % 100000}`
let rangeId = ''
const made: string[] = []

async function saveDraft(serviceDate: string, number: string | null = null): Promise<string> {
  const { data, error } = await supabase.rpc('save_invoice', {
    p_tenant_id: SEED.gasthaus,
    p_id: null as unknown as string,
    p_invoice: {
      number,
      number_range_id: rangeId,
      customer_id: null,
      recipient: { name: `Kantine ${prefix}` },
      issue_date: serviceDate,
      service_date_from: serviceDate,
      payment_days: 14,
    },
    p_items: [{ description: 'Mittagessen', quantity: 5, unit: '', unit_price_gross: 9.5, vat_rate: 7 }],
  })
  if (error) throw error
  made.push(data as string)
  return data as string
}

const read = async (id: string) =>
  (await supabase.from('invoices').select('number, issue_date, due_date').eq('id', id).single()).data!

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: SEED.dev, password: SEED.password })
  if (error) throw error
  const { data, error: rangeError } = await supabase
    .from('number_ranges')
    .insert({ tenant_id: SEED.gasthaus, name: `Test ${prefix}`, format: `${prefix}-{N}/{JJ}` })
    .select('id')
    .single()
  if (rangeError) throw rangeError
  rangeId = data.id
})

afterAll(async () => {
  await supabase.from('invoices').delete().in('id', made)
  // Ranges are archived, never deleted.
  await supabase.from('number_ranges').update({ archived_at: new Date().toISOString() }).eq('id', rangeId)
})

describe('numberDrafts (local Supabase)', () => {
  test('numbers drafts in service-date order with the given day as issue date, once', async () => {
    const later = await saveDraft('2026-11-20')
    const earlier = await saveDraft('2026-11-03')
    const numbered = await saveDraft('2026-11-01', `${prefix}-7/26`)

    expect(await numberDrafts(supabase, SEED.gasthaus, [later, earlier, numbered], '2026-11-30')).toEqual({ numbered: 2, skipped: 0 })
    // The counter continues after the highest number of the range.
    expect(await read(earlier)).toEqual({ number: `${prefix}-8/26`, issue_date: '2026-11-30', due_date: '2026-12-14' })
    expect(await read(later)).toMatchObject({ number: `${prefix}-9/26`, issue_date: '2026-11-30' })
    // An invoice that already has its number is left as it is.
    expect(await read(numbered)).toMatchObject({ number: `${prefix}-7/26`, issue_date: '2026-11-01' })

    // Nothing left to number.
    expect(await numberDrafts(supabase, SEED.gasthaus, [later, earlier], '2026-12-01')).toEqual({ numbered: 0, skipped: 0 })
    expect(await read(earlier)).toMatchObject({ number: `${prefix}-8/26`, issue_date: '2026-11-30' })
  })
})
