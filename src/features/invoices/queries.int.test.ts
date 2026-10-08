import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { getInvoice, listArticleChoices, listInvoiceNumbers, listInvoices } from './queries'

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const tag = `INT${Date.now()}`
let invoiceId = ''
let articleId = ''

beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({ email: SEED.dev, password: SEED.password })
  if (error) throw error
  const { data: id, error: rpcError } = await supabase.rpc('save_invoice', {
    p_tenant_id: SEED.gasthaus,
    p_id: null as unknown as string,
    p_invoice: {
      number: `${tag}-1`,
      customer_id: null,
      recipient: { name: `Kunde ${tag}` },
      issue_date: '2026-10-07',
      service_date_from: '2026-10-07',
      payment_days: 14,
    },
    p_items: [
      { description: 'B', quantity: 1, unit: '', unit_price_gross: 10, vat_rate: 7 },
      { description: 'A', quantity: 2, unit: '', unit_price_gross: 24.9, vat_rate: 7 },
    ],
  })
  if (rpcError) throw rpcError
  invoiceId = id as string
  const { data: article, error: articleError } = await supabase
    .from('articles')
    .insert({ tenant_id: SEED.gasthaus, name: `Artikel ${tag}`, unit: 'kg', unit_price_gross: 54.9, vat_rate: 7 })
    .select('id')
    .single()
  if (articleError) throw articleError
  articleId = article.id
})

afterAll(async () => {
  await supabase.from('invoices').delete().eq('id', invoiceId)
  await supabase.from('articles').delete().eq('id', articleId)
})

describe('invoice queries (local Supabase)', () => {
  test('list contains gross total computed with calcTotals and supports search', async () => {
    const rows = await listInvoices(supabase, SEED.gasthaus, { q: tag.toLowerCase() })
    expect(rows).toEqual([
      { id: invoiceId, number: `${tag}-1`, issueDate: '2026-10-07', dueDate: '2026-10-21', recipientName: `Kunde ${tag}`, grossCents: 5980 },
    ])
  })
  test('getInvoice returns items ordered by position', async () => {
    const invoice = await getInvoice(supabase, SEED.gasthaus, invoiceId)
    expect(invoice?.invoice_items.map((i) => i.description)).toEqual(['B', 'A'])
  })
  test('numbers and article choices', async () => {
    expect(await listInvoiceNumbers(supabase, SEED.gasthaus)).toContain(`${tag}-1`)
    const choice = (await listArticleChoices(supabase, SEED.gasthaus)).find((a) => a.id === articleId)
    expect(choice).toEqual({ id: articleId, name: `Artikel ${tag}`, description: null, unit: 'kg', unitPriceGross: 54.9, vatRate: 7 })
  })
  test('invoices of another tenant are not visible', async () => {
    expect(await getInvoice(supabase, SEED.metzgerei, invoiceId)).toBeNull()
    expect(await listInvoices(supabase, SEED.metzgerei, { q: tag.toLowerCase() })).toEqual([])
    expect(await listInvoiceNumbers(supabase, SEED.metzgerei)).not.toContain(`${tag}-1`)
    expect((await listArticleChoices(supabase, SEED.metzgerei)).map((a) => a.id)).not.toContain(articleId)
  })
})
