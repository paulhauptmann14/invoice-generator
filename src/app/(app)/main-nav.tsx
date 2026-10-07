'use client'

import { FileText, Package, Settings2, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/rechnungen', label: 'Rechnungen', icon: FileText },
  { href: '/kunden', label: 'Kunden', icon: Users },
  { href: '/artikel', label: 'Artikel', icon: Package },
  { href: '/einstellungen', label: 'Einstellungen', icon: Settings2 },
] as const

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`)
}

/** Desktop sidebar navigation (>= 768px). */
export function SideNav() {
  const isActive = useIsActive()
  return (
    <nav aria-label="Hauptnavigation" className="hidden md:block">
      <ul className="flex flex-col gap-1 px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm transition-colors duration-150',
                  active
                    ? 'bg-card font-medium text-foreground shadow-[inset_3px_0_0_var(--nav-indicator)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Mobile bottom tab bar (4 items, icon above label, >= 56px tall, respects the home-indicator safe area). */
export function TabBar() {
  const isActive = useIsActive()
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150',
                  active ? 'font-medium text-foreground shadow-[inset_0_3px_0_var(--nav-indicator)]' : 'text-muted-foreground',
                ].join(' ')}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
