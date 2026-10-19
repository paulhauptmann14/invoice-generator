'use server'

import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/require-tenant'
import { type FormState, fieldErrorsFrom } from '@/lib/form'
import { tenantPath } from '@/lib/tenant-paths'
import { ARTICLE_FIELDS, type ArticleField, articleSchema } from './schema'

const idSchema = z.uuid()

function readForm(formData: FormData): Record<ArticleField, string> {
  return Object.fromEntries(ARTICLE_FIELDS.map((k) => [k, String(formData.get(k) ?? '')])) as Record<ArticleField, string>
}

export async function saveArticle(
  tenantId: string,
  id: string | null,
  _prev: FormState<ArticleField>,
  formData: FormData,
): Promise<FormState<ArticleField>> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (id !== null && !idSchema.safeParse(id).success) throw new Error('Invalid article id')

  const values = readForm(formData)
  const parsed = articleSchema.safeParse(values)
  if (!parsed.success) {
    return { message: 'Bitte die markierten Felder prüfen.', fieldErrors: fieldErrorsFrom<ArticleField>(parsed.error), values }
  }

  const a = parsed.data
  const row = {
    name: a.name,
    description: a.description,
    unit: a.unit,
    unit_price_gross: a.unitPriceGross,
    vat_rate: a.vatRate,
  }
  let error
  if (id === null) {
    ;({ error } = await supabase.from('articles').insert({ ...row, tenant_id: tenant.id }))
  } else {
    // select('id'): an update that matches no row (deleted meanwhile) must not report success.
    const { data, error: updateError } = await supabase.from('articles').update(row).eq('id', id).eq('tenant_id', tenant.id).select('id')
    if (!updateError && data.length === 0) return { message: 'Der Artikel wurde nicht gefunden.', fieldErrors: {}, values }
    error = updateError
  }
  if (error) {
    console.error('saveArticle failed', error)
    return { message: 'Der Artikel konnte nicht gespeichert werden. Bitte erneut versuchen.', fieldErrors: {}, values }
  }
  redirect(tenantPath(tenant.id, 'artikel?gespeichert=1'))
}

export async function setArticleArchived(tenantId: string, id: string, archived: boolean): Promise<void> {
  const { supabase, tenant } = await requireTenant(tenantId)
  if (!idSchema.safeParse(id).success) throw new Error('Invalid article id')

  const { data, error } = await supabase
    .from('articles')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .select('id')
  if (error) throw new Error(`Archiving article failed: ${error.message}`)
  if (data.length === 0) notFound()
  redirect(tenantPath(tenant.id, archived ? `artikel?archiviert=${id}` : 'artikel?wiederhergestellt=1'))
}
