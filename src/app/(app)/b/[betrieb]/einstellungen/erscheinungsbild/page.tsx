import type { Metadata } from 'next'
import { StatusBanner } from '@/components/status-banner'
import { AppearanceForm } from '@/features/settings/appearance-form'
import { appearanceFormValues } from '@/features/settings/merge'
import { loadSettings } from '@/features/settings/repository'
import { requireTenant } from '@/lib/auth/require-tenant'

export const metadata: Metadata = { title: 'Erscheinungsbild · Einstellungen' }

type Props = { params: Promise<{ betrieb: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AppearanceSettingsPage({ params, searchParams }: Props) {
  const { supabase, tenant } = await requireTenant((await params).betrieb)
  const [settings, query] = await Promise.all([loadSettings(supabase, tenant.id), searchParams])
  const values = appearanceFormValues(settings.theme)
  return (
    <>
      {query.gespeichert && <StatusBanner>Erscheinungsbild gespeichert.</StatusBanner>}
      {/* Remount only when the form values change (after saving), not after a logo upload, which keeps unsaved edits. */}
      <AppearanceForm
        key={`appearance-${JSON.stringify(values)}`}
        initial={values}
        logo={{ present: settings.theme.logo.path !== null, version: settings.updatedAt }}
      />
    </>
  )
}
