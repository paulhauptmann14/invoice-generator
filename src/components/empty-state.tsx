import type { LucideIcon } from 'lucide-react'

/** Empty or no-result view: centered symbol, title and a sentence on what to do next. */
export function EmptyState({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="mt-6 flex flex-col items-center px-6 py-16 text-center">
      {Icon && <Icon aria-hidden strokeWidth={1.5} className="mb-4 size-10 text-muted-foreground" />}
      <p className="type-headline">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">{children}</div>}
    </div>
  )
}
