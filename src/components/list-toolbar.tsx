import { Search } from 'lucide-react'
import { SegmentedNav } from '@/components/segmented-nav'
import { Input } from '@/components/ui/input'

/** Search (GET form, Enter submits, works without JS) and the active/archived view switch. */
export function ListToolbar({
  basePath,
  q,
  archived,
  searchLabel,
  showViews = true,
}: {
  basePath: string
  q: string
  archived: boolean
  searchLabel: string
  showViews?: boolean
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <form role="search" action={basePath} className="relative w-full md:max-w-sm">
        {archived && <input type="hidden" name="ansicht" value="archiv" />}
        <label htmlFor="q" className="sr-only">
          {searchLabel}
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="Suchen" enterKeyHint="search" className="pl-9" />
      </form>
      {showViews && (
        <SegmentedNav
          label="Ansicht"
          segments={[
            { href: basePath, label: 'Aktiv', active: !archived },
            { href: `${basePath}?ansicht=archiv`, label: 'Archiviert', active: archived },
          ]}
        />
      )}
    </div>
  )
}
