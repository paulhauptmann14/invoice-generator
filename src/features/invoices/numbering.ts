import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { defaultRange, suggestForRange } from './draft'
import { listInvoiceNumbers, listNumberRanges } from './queries'

type Client = SupabaseClient<Database>

/**
 * Gives drafts their numbers: the next number of each draft's range for the year of `today`, and `today` as the issue date
 * (the day the invoice is issued). Several drafts are numbered in the order of their service date. A draft whose range is
 * archived or gone takes the default range; one without any usable range is skipped. Returns how many were numbered.
 */
export async function numberDrafts(supabase: Client, tenantId: string, ids: string[] | null, today: string): Promise<{ numbered: number; skipped: number }> {
  let query = supabase
    .from('invoices')
    .select('id, number_range_id')
    .eq('tenant_id', tenantId)
    .is('number', null)
    .order('service_date_from')
    .order('created_at')
  if (ids !== null) query = query.in('id', ids)
  const { data: drafts, error } = await query
  if (error) throw new Error(`Loading drafts failed: ${error.message}`)

  const [ranges, numbers] = await Promise.all([listNumberRanges(supabase, tenantId), listInvoiceNumbers(supabase, tenantId)])
  let existing = numbers
  let numbered = 0
  let skipped = 0
  for (const draft of drafts) {
    const rangeId = (ranges.find((r) => r.id === draft.number_range_id && !r.archived) ?? defaultRange(ranges))?.id ?? null
    // One retry: another invoice may have taken the number in the meantime (unique violation).
    for (let attempt = 0; ; attempt++) {
      const number = suggestForRange({ ranges, existing }, rangeId, today)
      if (number === '') {
        skipped += 1
        break
      }
      const { data, error: updateError } = await supabase
        .from('invoices')
        .update({ number, number_range_id: rangeId, issue_date: today })
        .eq('id', draft.id)
        .eq('tenant_id', tenantId)
        // Numbered meanwhile (another tab): leave it as it is.
        .is('number', null)
        .select('id')
      if (updateError?.code === '23505' && attempt === 0) {
        existing = await listInvoiceNumbers(supabase, tenantId)
        continue
      }
      if (updateError) throw new Error(`Numbering a draft failed: ${updateError.message}`)
      if (data.length > 0) {
        numbered += 1
        existing = [...existing, number]
      }
      break
    }
  }
  return { numbered, skipped }
}

