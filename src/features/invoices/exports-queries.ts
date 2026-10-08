import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type InvoiceExport = { id: string; filename: string; createdAt: string }

/** Archived PDF exports of one invoice, newest first. */
export async function listExports(supabase: SupabaseClient<Database>, tenantId: string, invoiceId: string): Promise<InvoiceExport[]> {
  const { data, error } = await supabase
    .from('invoice_exports')
    .select('id, filename, created_at')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Loading exports failed: ${error.message}`)
  return data.map((e) => ({ id: e.id, filename: e.filename, createdAt: e.created_at }))
}
