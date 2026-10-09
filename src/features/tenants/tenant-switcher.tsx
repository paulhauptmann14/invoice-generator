'use client'

import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { switchTenantPath } from '@/lib/tenant-paths'
import { NewTenantDialog } from './new-tenant-dialog'
import { useTenant } from './tenant-context'

/** The business name is the app's wordmark; it opens the list of businesses. */
export function TenantSwitcher() {
  const { tenant, tenants } = useTenant()
  const pathname = usePathname()
  const [dialogOpen, setDialogOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {/* Non-modal: the "new business" dialog opens right after the menu closes. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger ref={triggerRef} className="-ml-2 flex min-h-11 max-w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-muted md:ml-0 md:w-full md:px-3">
          <span className="min-w-0 truncate font-display text-base leading-tight font-semibold tracking-[0.12em] uppercase md:line-clamp-2 md:whitespace-normal">
            <span className="sr-only">Betrieb: </span>
            {tenant.name}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel>Betrieb wechseln</DropdownMenuLabel>
          <DropdownMenuGroup>
            {tenants.map((t) => {
              const current = t.id === tenant.id
              return (
                <DropdownMenuItem key={t.id} asChild>
                  <Link href={switchTenantPath(pathname, t.id)} aria-current={current ? 'true' : undefined} className={current ? 'font-medium' : undefined}>
                    <Check aria-hidden className={current ? undefined : 'invisible'} />
                    <span className="min-w-0 truncate" title={t.name}>
                      {t.name}
                    </span>
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <Plus aria-hidden />
            Neuer Betrieb …
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewTenantDialog open={dialogOpen} onOpenChange={setDialogOpen} returnFocusRef={triggerRef} />
    </>
  )
}
