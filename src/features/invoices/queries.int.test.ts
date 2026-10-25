import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Database, Json } from '@/lib/supabase/database.types'
import { SEED } from '@/test-support/seed-ids'
import { loadMissingRecipientAddress } from './recipient-address'
import { findInvoiceWithCustomerSeq, getInvoice, listArticleChoices, listInvoiceNumbers, listInvoices, listNumberRanges } from './queries'

const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const tag = `INT${Date.now()}`
let invoiceId = ''
let articleId = ''
let discountedId = ''
let copyId = ''

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
  // Spec example: buffet with 10 % item discount, drinks, 5 % invoice discount -> 577,79 EUR.
  const { data: discounted, error: discountedError } = await supabase.rpc('save_invoice', {
    p_tenant_id: SEED.gasthaus,
    p_id: null as unknown as string,
    p_invoice: {
      number: `${tag}-2`,
      customer_id: null,
      recipient: { name: `Kunde ${tag}` },
      issue_date: '2026-10-07',
      service_date_from: '2026-10-07',
      payment_days: 14,
      discount_kind: 'percent',
      discount_value: 5,
    },
    p_items: [
      { description: 'Buffet', quantity: 20, unit: '', unit_price_gross: 24.9, vat_rate: 7, discount_kind: 'percent', discount_value: 10 },
      { description: 'Getränke', quantity: 20, unit: '', unit_price_gross: 8, vat_rate: 19, discount_kind: null, discount_value: null },
    ],
  })
  if (discountedError) throw discountedError
  discountedId = discounted as string
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
  if (discountedId) await supabase.from('invoices').delete().eq('id', discountedId)
  if (copyId) await supabase.from('invoices').delete().eq('id', copyId)
  await supabase.from('articles').delete().eq('id', articleId)
})

describe('invoice queries (local Supabase)', () => {
  test('list contains gross total computed with calcTotals and supports search', async () => {
    const rows = await listInvoices(supabase, SEED.gasthaus, { q: `${tag.toLowerCase()}-1` })
    expect(rows).toEqual([
      { id: invoiceId, number: `${tag}-1`, issueDate: '2026-10-07', dueDate: '2026-10-21', recipientName: `Kunde ${tag}`, grossCents: 5980 },
    ])
  })
  test('getInvoice returns items ordered by position', async () => {
    const invoice = await getInvoice(supabase, SEED.gasthaus, invoiceId)
    expect(invoice?.invoice_items.map((i) => i.description)).toEqual(['B', 'A'])
  })
  test('discounts are stored, loaded and reflected in the list total', async () => {
    const invoice = await getInvoice(supabase, SEED.gasthaus, discountedId)
    expect(invoice).toMatchObject({ discount_kind: 'percent', discount_value: 5 })
    expect(invoice?.invoice_items.map((i) => [i.description, i.discount_kind, i.discount_value])).toEqual([
      ['Buffet', 'percent', 10],
      ['Getränke', null, null],
    ])
    const rows = await listInvoices(supabase, SEED.gasthaus, { q: `${tag.toLowerCase()}-2` })
    expect(rows.map((r) => r.grossCents)).toEqual([57779])
    // An invoice without discounts still reads back as null columns.
    expect(await getInvoice(supabase, SEED.gasthaus, invoiceId)).toMatchObject({ discount_kind: null, discount_value: null })
  })
  test('a copy built like copyInvoice keeps item and invoice discount', async () => {
    const source = (await getInvoice(supabase, SEED.gasthaus, discountedId))!
    const { data: id, error } = await supabase.rpc('save_invoice', {
      p_tenant_id: SEED.gasthaus,
      p_id: null as unknown as string,
      p_invoice: {
        number: `${tag}-3`,
        customer_id: source.customer_id,
        recipient: source.recipient as Json,
        issue_date: '2026-10-08',
        service_date_from: '2026-10-08',
        payment_days: source.payment_days,
        discount_kind: source.discount_kind,
        discount_value: source.discount_value,
      },
      p_items: source.invoice_items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price_gross: i.unit_price_gross,
        vat_rate: i.vat_rate,
        article_id: i.article_id,
        discount_kind: i.discount_kind,
        discount_value: i.discount_value,
      })),
    })
    expect(error).toBeNull()
    copyId = id as string
    const copy = (await getInvoice(supabase, SEED.gasthaus, copyId))!
    expect(copy).toMatchObject({ discount_kind: 'percent', discount_value: 5 })
    expect(copy.invoice_items.map((i) => [i.discount_kind, i.discount_value])).toEqual([['percent', 10], [null, null]])
  })
  test('per-customer counter: assigned on insert in order, kept on update, copies count on', async () => {
    const seqOf = async (id: string) => (await getInvoice(supabase, SEED.gasthaus, id))?.customer_seq
    expect([await seqOf(invoiceId), await seqOf(discountedId), await seqOf(copyId)]).toEqual([1, 2, 3])
    const { error } = await supabase.rpc('save_invoice', {
      p_tenant_id: SEED.gasthaus,
      p_id: invoiceId,
      p_invoice: {
        number: `${tag}-1`,
        customer_id: null,
        recipient: { name: `Anderer ${tag}` },
        issue_date: '2026-10-07',
        service_date_from: '2026-10-07',
        payment_days: 14,
      },
      p_items: [{ description: 'A', quantity: 1, unit: '', unit_price_gross: 10, vat_rate: 7 }],
    })
    expect(error).toBeNull()
    expect(await seqOf(invoiceId)).toBe(1)
  })
  test('manual counter on insert and update, and the duplicate lookup', async () => {
    const name = `Zähler ${tag}`
    const save = async (id: string | null, number: string, customerSeq: number | null, recipientName = name) => {
      const { data, error } = await supabase.rpc('save_invoice', {
        p_tenant_id: SEED.gasthaus,
        p_id: id as unknown as string,
        p_invoice: {
          number,
          customer_id: null,
          recipient: { name: recipientName },
          issue_date: '2026-10-07',
          service_date_from: '2026-10-07',
          payment_days: 14,
          ...(customerSeq === null ? {} : { customer_seq: customerSeq }),
        },
        p_items: [{ description: 'A', quantity: 1, unit: '', unit_price_gross: 10, vat_rate: 7 }],
      })
      expect(error).toBeNull()
      return data as string
    }
    const seqOf = async (id: string) => (await getInvoice(supabase, SEED.gasthaus, id))?.customer_seq
    const first = await save(null, `${tag}-Z1`, 5)
    const second = await save(null, `${tag}-Z2`, null)
    try {
      expect([await seqOf(first), await seqOf(second)]).toEqual([5, 6])
      // The same free-text customer (case and spacing ignored) already has 5 -> the other invoice is reported.
      const lookup = (customerSeq: number, over: Partial<Parameters<typeof findInvoiceWithCustomerSeq>[2]> = {}) =>
        findInvoiceWithCustomerSeq(supabase, SEED.gasthaus, {
          customerId: null, recipientName: name, numberRangeId: null, customerSeq, excludeInvoiceId: null, ...over,
        })
      expect(await lookup(5)).toBe(`${tag}-Z1`)
      expect(await lookup(5, { recipientName: `  ZÄHLER   ${tag.toLowerCase()} ` })).toBe(`${tag}-Z1`)
      expect(await lookup(5, { excludeInvoiceId: first })).toBeNull()
      expect(await lookup(7)).toBeNull()
      expect(await lookup(5, { recipientName: `Anderer ${tag}` })).toBeNull()
      // Other number range / other tenant: a different group.
      const rangeId = (await listNumberRanges(supabase, SEED.gasthaus))[0].id
      expect(await lookup(5, { numberRangeId: rangeId })).toBeNull()
      expect(
        await findInvoiceWithCustomerSeq(supabase, SEED.metzgerei, { customerId: null, recipientName: name, numberRangeId: null, customerSeq: 5, excludeInvoiceId: null }),
      ).toBeNull()
      // Update: a given value replaces the stored one, none keeps it.
      await save(first, `${tag}-Z1`, 9)
      expect(await seqOf(first)).toBe(9)
      await save(first, `${tag}-Z1`, null)
      expect(await seqOf(first)).toBe(9)
    } finally {
      await supabase.from('invoices').delete().in('id', [first, second])
    }
  })
  test('numbers and article choices', async () => {
    expect(await listInvoiceNumbers(supabase, SEED.gasthaus)).toContain(`${tag}-1`)
    const choice = (await listArticleChoices(supabase, SEED.gasthaus)).find((a) => a.id === articleId)
    expect(choice).toEqual({ id: articleId, name: `Artikel ${tag}`, description: null, unit: 'kg', unitPriceGross: 54.9, vatRate: 7 })
  })
  test('listInvoiceNumbers returns every row when more than one page exists', async () => {
    const all = await listInvoiceNumbers(supabase, SEED.gasthaus)
    expect(all.length).toBeGreaterThanOrEqual(3)
    // Page size 2 forces several requests (and a last, full page when the count is even).
    const paged = await listInvoiceNumbers(supabase, SEED.gasthaus, 2)
    expect([...paged].sort()).toEqual([...all].sort())
    expect(new Set(paged).size).toBe(paged.length)
    expect(paged).toEqual(expect.arrayContaining([`${tag}-1`, `${tag}-2`, `${tag}-3`]))
    expect(await listInvoiceNumbers(supabase, SEED.gasthaus, all.length)).toHaveLength(all.length)
  })
  test('export block: address required above 250 EUR only, per tenant', async () => {
    // tag-1 is 59,80 EUR without an address: small-amount invoice, export allowed.
    expect(await loadMissingRecipientAddress(supabase, SEED.gasthaus, invoiceId)).toEqual([])
    // tag-2 is 577,79 EUR and the recipient has only a name.
    expect(await loadMissingRecipientAddress(supabase, SEED.gasthaus, discountedId)).toEqual(['Straße', 'PLZ', 'Ort'])
    // Not visible from another tenant: nothing to block.
    expect(await loadMissingRecipientAddress(supabase, SEED.metzgerei, discountedId)).toEqual([])
  })
  test('invoices of another tenant are not visible', async () => {
    expect(await getInvoice(supabase, SEED.metzgerei, invoiceId)).toBeNull()
    expect(await listInvoices(supabase, SEED.metzgerei, { q: tag.toLowerCase() })).toEqual([])
    expect(await listInvoiceNumbers(supabase, SEED.metzgerei)).not.toContain(`${tag}-1`)
    expect((await listArticleChoices(supabase, SEED.metzgerei)).map((a) => a.id)).not.toContain(articleId)
  })
  test('number ranges per tenant, default first', async () => {
    const gasthaus = await listNumberRanges(supabase, SEED.gasthaus)
    expect(gasthaus.slice(0, 2).map((r) => [r.name, r.format, r.isDefault])).toEqual([
      ['Rechnungen', 'G{N}/{JJ}', true],
      ['Gutscheine', 'GU{N}/{JJ}', false],
    ])
    expect((await listNumberRanges(supabase, SEED.metzgerei)).map((r) => r.format)).toEqual(['M{N}/{JJ}'])
  })
})
