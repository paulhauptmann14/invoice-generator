'use client'

import { usePathname } from 'next/navigation'
import { SegmentedNav } from '@/components/segmented-nav'
import { useTenant } from '@/features/tenants/tenant-context'

const TABS = [
  { slug: 'firma', label: 'Firma' },
  { slug: 'zahlung', label: 'Zahlung' },
  { slug: 'nummern', label: 'Nummern & Dateien' },
  { slug: 'erscheinungsbild', label: 'Erscheinungsbild' },
] as const

/** Tabs of the settings page as a segmented control (each tab is its own page and form). */
export function SettingsNav() {
  const { path } = useTenant()
  const pathname = usePathname()
  const segments = TABS.map(({ slug, label }) => {
    const href = path(`einstellungen/${slug}`)
    return { href, label, active: pathname === href }
  })
  return <SegmentedNav label="Einstellungen" segments={segments} className="mt-6" />
}
