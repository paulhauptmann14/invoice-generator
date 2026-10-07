import { Search } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Search (GET form, works without JS) and the active/archived view switch. */
export function ListToolbar({
  basePath,
  q,
  archived,
  searchLabel,
}: {
  basePath: string
  q: string
  archived: boolean
  searchLabel: string
}) {
  const tab = (active: boolean) =>
    [
      'inline-flex min-h-11 items-center px-3 text-sm transition-colors duration-150 md:min-h-9',
      active
        ? 'font-medium text-foreground shadow-[inset_0_-2px_0_var(--nav-indicator)]'
        : 'text-muted-foreground hover:text-foreground',
    ].join(' ')
  return (
    <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <form role="search" action={basePath} className="flex w-full gap-2 md:max-w-md">
        {archived && <input type="hidden" name="ansicht" value="archiv" />}
        <label htmlFor="q" className="sr-only">
          {searchLabel}
        </label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="Suchen" className="bg-card" />
        <Button type="submit" variant="outline" className="gap-2">
          <Search aria-hidden className="size-4" />
          Suchen
        </Button>
      </form>
      <nav aria-label="Ansicht" className="flex">
        <Link href={basePath} aria-current={!archived ? 'page' : undefined} className={tab(!archived)}>
          Aktiv
        </Link>
        <Link href={`${basePath}?ansicht=archiv`} aria-current={archived ? 'page' : undefined} className={tab(archived)}>
          Archiviert
        </Link>
      </nav>
    </div>
  )
}
