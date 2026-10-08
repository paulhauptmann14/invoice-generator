import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { setArticleArchived } from '@/features/articles/actions'
import { ArticleForm } from '@/features/articles/article-form'
import { getArticle } from '@/features/articles/queries'
import { requireTenant } from '@/lib/auth/require-tenant'
import { formatDecimalInput } from '@/lib/domain/decimal'

export const metadata: Metadata = { title: 'Artikel bearbeiten' }

export default async function EditArticlePage({ params }: { params: Promise<{ betrieb: string; id: string }> }) {
  const { betrieb, id } = await params
  const { supabase, tenant } = await requireTenant(betrieb)
  if (!z.uuid().safeParse(id).success) notFound()
  const article = await getArticle(supabase, tenant.id, id)
  if (!article) notFound()

  const archived = article.archived_at !== null
  return (
    <>
      <PageHeader
        title={article.name}
        description={archived ? 'Archiviert – erscheint nicht in der Artikelauswahl.' : 'Artikel bearbeiten'}
        actions={
          <form action={setArticleArchived.bind(null, tenant.id, article.id, !archived)}>
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
