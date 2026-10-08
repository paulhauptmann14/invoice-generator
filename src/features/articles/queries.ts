import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/supabase/database.types'
import { escapeLike, normalizeSearch } from '@/lib/search'

type Client = SupabaseClient<Database>
export const LIST_LIMIT = 500

export type ArticleRow = Pick<Tables<'articles'>, 'id' | 'name' | 'description' | 'unit' | 'unit_price_gross' | 'vat_rate' | 'archived_at'>
export type ArticleRecord = Tables<'articles'>

export async function listArticles(supabase: Client, tenantId: string, opts: { q: string; archived: boolean }): Promise<ArticleRow[]> {
  let query = supabase
    .from('articles')
    .select('id, name, description, unit, unit_price_gross, vat_rate, archived_at')
    .eq('tenant_id', tenantId)
    .order('name')
    .limit(LIST_LIMIT)
  query = opts.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  const term = normalizeSearch(opts.q)
  if (term) query = query.ilike('search_text', `%${escapeLike(term)}%`)

  const { data, error } = await query
  if (error) throw new Error(`Loading articles failed: ${error.message}`)
  return data
}

export async function getArticle(supabase: Client, tenantId: string, id: string): Promise<ArticleRecord | null> {
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (error) throw new Error(`Loading article failed: ${error.message}`)
  return data
}

/** Distinguishes "no articles yet" from "all articles are archived" in the empty state. */
export async function hasArchivedArticles(supabase: Client, tenantId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('archived_at', 'is', null)
  if (error) throw new Error(`Counting archived articles failed: ${error.message}`)
  return (count ?? 0) > 0
}
