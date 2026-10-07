'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireMember } from '@/lib/auth/require-member'
import { type FormState, fieldErrorsFrom } from '@/lib/form'
import { ARTICLE_FIELDS, type ArticleField, articleSchema } from './schema'

const idSchema = z.uuid()

function readForm(formData: FormData): Record<ArticleField, string> {
  return Object.fromEntries(ARTICLE_FIELDS.map((k) => [k, String(formData.get(k) ?? '')])) as Record<ArticleField, string>
}

export async function saveArticle(
  id: string | null,
  _prev: FormState<ArticleField>,
  formData: FormData,
): Promise<FormState<ArticleField>> {
  const { supabase } = await requireMember()
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
  const { error } =
    id === null ? await supabase.from('articles').insert(row) : await supabase.from('articles').update(row).eq('id', id)
  if (error) {
    console.error('saveArticle failed', error)
    return { message: 'Der Artikel konnte nicht gespeichert werden. Bitte erneut versuchen.', fieldErrors: {}, values }
  }
  redirect('/artikel?gespeichert=1')
}

export async function setArticleArchived(id: string, archived: boolean): Promise<void> {
  const { supabase } = await requireMember()
  if (!idSchema.safeParse(id).success) throw new Error('Invalid article id')

  const { error } = await supabase
    .from('articles')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(`Archiving article failed: ${error.message}`)
  redirect(archived ? `/artikel?archiviert=${id}` : '/artikel?wiederhergestellt=1')
}
