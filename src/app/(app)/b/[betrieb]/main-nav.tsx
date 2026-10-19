'use client'

import { FileText, Package, Settings2, Users } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { GuardedLink } from '@/components/unsaved-changes'
import { useTenant } from '@/features/tenants/tenant-context'

const sections = [
  { section: 'rechnungen', label: 'Rechnungen', icon: FileText },
  { section: 'kunden', label: 'Kunden', icon: Users },
  { section: 'artikel', label: 'Artikel', icon: Package },
  { section: 'einstellungen', label: 'Einstellungen', icon: Settings2 },
] as const

function useItems() {
  const { path } = useTenant()
  return sections.map((s) => ({ ...s, href: path(s.section) }))
}

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`)
}

/** Desktop sidebar navigation (>= 768px). */
export function SideNav() {
  const isActive = useIsActive()
  const items = useItems()
  return (
    <nav aria-label="Hauptnavigation" className="hidden md:block">
      <ul className="flex flex-col gap-0.5 px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <li key={href}>
              <GuardedLink
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground transition-colors duration-(--duration-fast) active:bg-(--sidebar-selection) active:duration-0',
                  active ? 'bg-(--sidebar-selection) font-semibold' : 'hover:bg-(--sidebar-hover)',
                ].join(' ')}
              >
                <Icon aria-hidden strokeWidth={active ? 2.25 : 1.75} className={active ? 'size-4 shrink-0' : 'size-4 shrink-0 text-muted-foreground'} />
                {label}
              </GuardedLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Mobile bottom tab bar (4 items, icon above label, >= 56px tall, respects the home-indicator safe area).
 * Translucent material: the page scrolls underneath and stays faintly visible (solid with reduced transparency).
 */
export function TabBar() {
  const isActive = useIsActive()
  const items = useItems()
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-(--material-bar) pb-[env(safe-area-inset-bottom)] backdrop-blur-(--material-blur) backdrop-saturate-150 md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <li key={href}>
              <GuardedLink
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors duration-(--duration-fast) active:bg-pressed/70 active:duration-0',
                  active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
                ].join(' ')}
              >
                {/* Selected tab: ink and a heavier stroke (not color alone); no indicator bar. */}
                <Icon aria-hidden strokeWidth={active ? 2.25 : 1.75} className="size-6" />
                {label}
              </GuardedLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
