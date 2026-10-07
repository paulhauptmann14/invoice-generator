/** Signature element: invoice numbers look like an impression of a red numbering stamp. */
export function InvoiceNumberStamp({ number, size = 'sm' }: { number: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={[
        'inline-block rounded-sm border border-stamp font-mono font-medium tracking-[0.06em] text-stamp tabular-nums',
        size === 'lg' ? 'px-2 py-0.5 text-base' : 'px-1.5 text-sm',
      ].join(' ')}
    >
      {number}
    </span>
  )
}
