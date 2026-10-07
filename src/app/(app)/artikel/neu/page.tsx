import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { ArticleForm } from '@/features/articles/article-form'
import { requireMember } from '@/lib/auth/require-member'

export const metadata: Metadata = { title: 'Neuer Artikel' }

export default async function NewArticlePage() {
  await requireMember()
  return (
    <>
      <PageHeader title="Neuer Artikel" />
      <ArticleForm id={null} initial={{ vatRate: '7' }} />
    </>
  )
}
