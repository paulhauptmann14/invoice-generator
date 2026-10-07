import { CircleAlert } from 'lucide-react'

/** Inline field error: icon + text (never color alone), linked via aria-describedby. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-stamp">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
