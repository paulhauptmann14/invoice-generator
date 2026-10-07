import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { setArticleArchived } from '@/features/articles/actions'
import { ArticleForm } from '@/features/articles/article-form'
import { getArticle } from '@/features/articles/queries'
import { requireMember } from '@/lib/auth/require-member'
import { formatDecimalInput } from '@/lib/domain/decimal'

export const metadata: Metadata = { title: 'Artikel bearbeiten' }

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireMember()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const article = await getArticle(supabase, id)
  if (!article) notFound()

  const archived = article.archived_at !== null
  return (
    <>
      <PageHeader
        title={article.name}
        description={archived ? 'Archiviert – erscheint nicht in der Artikelauswahl.' : 'Artikel bearbeiten'}
        actions={
          <form action={setArticleArchived.bind(null, article.id, !archived)}>
            <Button type="submit" variant="outline">
              {archived ? 'Wiederherstellen' : 'Archivieren'}
            </Button>
          </form>
        }
      />
      <ArticleForm
        id={article.id}
        initial={{
          name: article.name,
          description: article.description ?? '',
          unit: article.unit,
          unitPriceGross: formatDecimalInput(article.unit_price_gross),
          vatRate: String(Number(article.vat_rate)),
        }}
      />
    </>
  )
}
