import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { ArticleForm } from '@/features/articles/article-form'
import { requireTenant } from '@/lib/auth/require-tenant'

export const metadata: Metadata = { title: 'Neuer Artikel' }

export default async function NewArticlePage({ params }: { params: Promise<{ betrieb: string }> }) {
  await requireTenant((await params).betrieb)
  return (
    <>
      <PageHeader title="Neuer Artikel" />
      <ArticleForm id={null} initial={{ vatRate: '7' }} />
    </>
  )
}
