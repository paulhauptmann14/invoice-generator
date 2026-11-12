import { DRAFT_LABEL } from '@/lib/domain/invoice-number'

/** Invoice numbers are always shown the same way: monospaced, tabular, in ink. A draft (null) shows as a badge. */
export function InvoiceNumber({ number, size = 'sm' }: { number: string | null; size?: 'sm' | 'lg' }) {
  if (number === null) {
    return (
      <span className={['inline-flex items-center rounded-md border border-dashed border-border px-2 font-medium text-muted-foreground', size === 'lg' ? 'py-0.5 text-base' : 'text-xs'].join(' ')}>
        {DRAFT_LABEL}
      </span>
    )
  }
  return (
    <span className={['font-mono font-medium tracking-[0.04em] text-foreground tabular-nums', size === 'lg' ? 'text-lg' : 'text-sm'].join(' ')}>
      {number}
    </span>
  )
}
