'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/features/tenants/tenant-context'

const TABS = [
  { slug: 'firma', label: 'Firma' },
  { slug: 'zahlung', label: 'Zahlung' },
  { slug: 'nummern', label: 'Nummern & Dateien' },
  { slug: 'erscheinungsbild', label: 'Erscheinungsbild' },
] as const

/** Tabs of the settings page as links (each tab is its own page and form). Only the bar scrolls on small screens. */
export function SettingsNav() {
  const { path } = useTenant()
  const pathname = usePathname()
  return (
    <nav aria-label="Einstellungen" className="mt-6 -mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max">
        {TABS.map(({ slug, label }) => {
          const href = path(`einstellungen/${slug}`)
          const active = pathname === href
          return (
            <li key={slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex min-h-11 items-center rounded-t-md px-3 text-sm whitespace-nowrap transition-colors duration-(--duration-fast) active:bg-pressed active:duration-0',
                  active ? 'font-medium text-foreground shadow-[inset_0_-2px_0_var(--nav-indicator)]' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
