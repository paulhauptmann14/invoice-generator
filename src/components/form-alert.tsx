import { CircleAlert } from 'lucide-react'

/** Form-level error. Focusable so it can receive focus after a failed submit. */
export function FormAlert({ ref, children }: { ref?: React.Ref<HTMLDivElement>; children: React.ReactNode }) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-2 rounded-md border border-stamp/40 bg-stamp/5 px-3 py-2.5 text-sm text-stamp"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
