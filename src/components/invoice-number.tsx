/** Invoice numbers are always shown the same way: monospaced, tabular, in ink. */
export function InvoiceNumber({ number, size = 'sm' }: { number: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={['font-mono font-medium tracking-[0.04em] text-foreground tabular-nums', size === 'lg' ? 'text-lg' : 'text-sm'].join(' ')}>
      {number}
    </span>
  )
}
