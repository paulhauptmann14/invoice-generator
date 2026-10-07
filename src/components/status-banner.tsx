import { CircleCheck } from 'lucide-react'

/** Polite confirmation after an action (announced by screen readers, never steals focus). */
export function StatusBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-4 py-3 text-sm"
    >
      <CircleCheck aria-hidden className="size-4 shrink-0" />
      {children}
    </div>
  )
}
