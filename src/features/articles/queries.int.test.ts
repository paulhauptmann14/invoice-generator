import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { getArticle, listArticles, hasArchivedArticles } from './queries'

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const tag = `t${Date.now()}`
const ids: string[] = []

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: 'dev@invoice.localhost', password: 'lokales-dev-passwort-123' })
  if (error) throw error
  const { data, error: insertError } = await supabase
    .from('articles')
    .insert([
      { name: `Rinderfilet ${tag}`, description: 'vom Weiderind', unit: 'kg', unit_price_gross: 54.9, vat_rate: 7 },
      { name: `Apfelschorle ${tag}`, unit: 'Fl.', unit_price_gross: 3.5, vat_rate: 19, archived_at: new Date().toISOString() },
    ])
    .select('id')
  if (insertError) throw insertError
  ids.push(...data.map((r) => r.id))
})

afterAll(async () => {
  await supabase.from('articles').delete().in('id', ids)
})

describe('article queries (local Supabase)', () => {
  test('search finds by description; numeric fields come back as numbers', async () => {
    const rows = await listArticles(supabase, { q: 'weiderind', archived: false })
    const row = rows.find((r) => r.name === `Rinderfilet ${tag}`)
    expect(row).toMatchObject({ unit: 'kg', unit_price_gross: 54.9, vat_rate: 7 })
  })
  test('archived view', async () => {
    const rows = await listArticles(supabase, { q: tag, archived: true })
    expect(rows.map((r) => r.name)).toEqual([`Apfelschorle ${tag}`])
  })
  test('getArticle returns null for unknown ids', async () => {
    expect(await getArticle(supabase, '00000000-0000-0000-0000-000000000000')).toBeNull()
    expect((await getArticle(supabase, ids[0]))?.name).toBe(`Rinderfilet ${tag}`)
  })
  test('hasArchivedArticles reports archived entries', async () => {
    expect(await hasArchivedArticles(supabase)).toBe(true)
  })
})
