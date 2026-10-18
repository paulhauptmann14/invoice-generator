import type { Metadata } from 'next'
import { StatusBanner } from '@/components/status-banner'
import { defaultRange } from '@/features/invoices/draft'
import { listNumberRanges } from '@/features/invoices/queries'
import { FilenameForm } from '@/features/settings/filename-form'
import { NumberRanges } from '@/features/settings/number-ranges'
import { exampleNumber } from '@/features/settings/number-range-rules'
import { loadSettings } from '@/features/settings/repository'
import { requireTenant } from '@/lib/auth/require-tenant'
import { todayIso, yearOf } from '@/lib/domain/dates'

export const metadata: Metadata = { title: 'Nummern & Dateien · Einstellungen' }

type Props = { params: Promise<{ betrieb: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function NumberSettingsPage({ params, searchParams }: Props) {
  const { supabase, tenant } = await requireTenant((await params).betrieb)
  const [settings, ranges, query] = await Promise.all([loadSettings(supabase, tenant.id), listNumberRanges(supabase, tenant.id), searchParams])
  const today = todayIso()
  const year = yearOf(today)
  const exampleNumberText = exampleNumber(defaultRange(ranges)?.format ?? '', year) || '2026-0001'
  return (
    <>
      {query.gespeichert && <StatusBanner>Gespeichert.</StatusBanner>}
      <div className="mt-8 max-w-3xl space-y-12">
        <NumberRanges ranges={ranges} year={year} />
        <FilenameForm key={`filename-${settings.updatedAt}`} initial={settings.filenameTemplate} example={{ number: exampleNumberText, issueDate: today }} />
      </div>
    </>
  )
}
